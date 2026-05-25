import json
import logging
import time
from datetime import datetime, timezone
from flask_socketio import emit
from extensions import socketio
from db import get_db
from state import check_msg_rate, get_level, online_users, rooms_text_muted, push_tokens
from handlers.push import send_push

log = logging.getLogger(__name__)


@socketio.on('message')
def handle_message(data):
    room = data.get('room', '')
    if not data.get('system'):
        username = data.get('username', '')
        if not check_msg_rate(username):
            emit('message_rate_limited', {})
            return
        room_muted = rooms_text_muted.get(room, {})
        if username in room_muted:
            expiry = room_muted[username]
            if expiry is None or expiry > time.time():
                emit('text_muted_notify', {})
                return
            del room_muted[username]
        try:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute(
                    'INSERT INTO messages (room, username, screenname, text, time)'
                    ' VALUES (%s, %s, %s, %s, %s) RETURNING id',
                    (room, data['username'], data['screenname'], data['text'],
                     datetime.now().strftime('%H:%M'))
                )
                data['id'] = cur.fetchone()['id']
                conn.commit()
            data['time'] = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            log.error('message save error: %s', e)

    emit('message', data, to=room)

    if data.get('system'):
        return

    sender = data.get('username', '')
    sender_screen = data.get('screenname', sender)
    text = data.get('text', '')[:100]

    if room.startswith('dm:'):
        parts = room.split(':')
        if len(parts) == 3:
            recipient = parts[2] if parts[1] == sender else parts[1]
            if recipient in online_users:
                for sid in list(online_users[recipient]):
                    socketio.emit('new_dm_notification', {
                        'dm_room': room,
                        'from_username': sender,
                        'from_screenname': sender_screen,
                    }, to=sid)
            else:
                tokens = push_tokens.get(recipient, [])
                if tokens:
                    send_push(tokens, sender_screen, text, {'room': room})
    else:
        try:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute('SELECT members FROM rooms WHERE name = %s', (room,))
                row = cur.fetchone()
            if row:
                for member in (row['members'] or []):
                    if member != sender and member not in online_users:
                        tokens = push_tokens.get(member, [])
                        if tokens:
                            send_push(tokens, f'{sender_screen} in {room}', text, {'room': room})
        except Exception as e:
            log.error('push notify error: %s', e)


@socketio.on('recall_message')
def handle_recall_message(data):
    msg_id = data.get('id')
    username = data.get('username')
    room = data.get('room')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, recalled FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            if not msg or msg['recalled']:
                return
            if msg['username'] != username:
                cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
                room_data = cur.fetchone()
                if not room_data or get_level(username, room_data) < 1:
                    return
            cur.execute('UPDATE messages SET recalled = true WHERE id = %s', (msg_id,))
            conn.commit()
        emit('message_recalled', {'id': msg_id, 'room': room}, to=room)
    except Exception as e:
        log.error('recall_message error: %s', e)


@socketio.on('edit_message')
def handle_edit_message(data):
    msg_id = data.get('id')
    username = data.get('username')
    new_text = (data.get('text') or '').strip()
    room = data.get('room')
    if not new_text:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, recalled FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            if not msg or msg['recalled'] or msg['username'] != username:
                return
            cur.execute('UPDATE messages SET text = %s, edited = true WHERE id = %s',
                        (new_text, msg_id))
            conn.commit()
        emit('message_edited', {'id': msg_id, 'text': new_text, 'room': room}, to=room)
    except Exception as e:
        log.error('edit_message error: %s', e)


@socketio.on('add_reaction')
def handle_add_reaction(data):
    msg_id = data.get('id')
    username = data.get('username')
    emoji = data.get('emoji', '').strip()
    room = data.get('room')
    if not all([msg_id, username, emoji, room]):
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT reactions, recalled FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            if not msg or msg['recalled']:
                return
            reactions = dict(msg.get('reactions') or {})
            users = list(reactions.get(emoji, []))
            if username in users:
                users.remove(username)
            else:
                users.append(username)
            if users:
                reactions[emoji] = users
            else:
                reactions.pop(emoji, None)
            cur.execute('UPDATE messages SET reactions = %s WHERE id = %s',
                        (json.dumps(reactions), msg_id))
            conn.commit()
        emit('reaction_updated', {'id': msg_id, 'reactions': reactions, 'room': room}, to=room)
    except Exception as e:
        log.error('add_reaction error: %s', e)

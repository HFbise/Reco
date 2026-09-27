import json
import logging
from datetime import datetime, timezone
from flask_socketio import emit
from extensions import socketio
from db import get_db
from state import check_msg_rate, get_level, online_users, push_tokens
from handlers.push import send_push
from auth_session import authenticated, in_room
import moderation

log = logging.getLogger(__name__)


MAX_MESSAGE_LEN = 4000


@socketio.on('message')
@authenticated
def handle_message(username, data):
    room = data.get('room', '')
    text = (data.get('text') or '').strip()[:MAX_MESSAGE_LEN]
    # Only sockets that passed the join checks (member / DM participant) are in the room.
    if not text or not in_room(room):
        return
    if not check_msg_rate(username):
        emit('message_rate_limited', {})
        return
    if moderation.is_muted(room, username):
        emit('text_muted_notify', {})
        return

    # Built server-side: clients can't spoof the sender, display name or `system` flag.
    msg = {'username': username, 'screenname': username, 'room': room, 'text': text}
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            if row:
                msg['screenname'] = row['screenname']
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time)'
                ' VALUES (%s, %s, %s, %s, %s) RETURNING id',
                (room, username, msg['screenname'], text, datetime.now().strftime('%H:%M'))
            )
            msg['id'] = cur.fetchone()['id']
            conn.commit()
        msg['time'] = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        log.error('message save error: %s', e)

    emit('message', msg, to=room)

    sender = username
    sender_screen = msg['screenname']
    text = text[:100]

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
@authenticated
def handle_recall_message(username, data):
    msg_id = data.get('id')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, room, recalled FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            if not msg or msg['recalled']:
                return
            room = msg['room']
            if msg['username'] != username:
                cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
                room_data = cur.fetchone()
                if not room_data or get_level(username, room_data) < 1:
                    return
        moderation.recall(msg_id)
    except Exception as e:
        log.error('recall_message error: %s', e)


@socketio.on('edit_message')
@authenticated
def handle_edit_message(username, data):
    msg_id = data.get('id')
    new_text = (data.get('text') or '').strip()[:MAX_MESSAGE_LEN]
    if not new_text:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, room, recalled FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            if not msg or msg['recalled'] or msg['username'] != username:
                return
            room = msg['room']
            cur.execute('UPDATE messages SET text = %s, edited = true WHERE id = %s',
                        (new_text, msg_id))
            conn.commit()
        emit('message_edited', {'id': msg_id, 'text': new_text, 'room': room}, to=room)
    except Exception as e:
        log.error('edit_message error: %s', e)


@socketio.on('add_reaction')
@authenticated
def handle_add_reaction(username, data):
    msg_id = data.get('id')
    emoji = data.get('emoji', '').strip()
    if not msg_id or not emoji or len(emoji) > 16:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT room, reactions, recalled FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            # Must be able to see the message to react to it
            if not msg or msg['recalled'] or not in_room(msg['room']):
                return
            room = msg['room']
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

import json
import logging
import time
import urllib.parse
from datetime import datetime

from flask_socketio import emit

import chat_prefs
import history
import images
import moderation
import reads
import room_log
import user_settings
import webpush
from auth_session import authenticated, dm_participants, in_room, readable
from db import get_db
from demo import DEMO_ROOM
from extensions import socketio
from handlers.push import send_push, tokens_for
from state import check_msg_rate, get_level, is_watching, online_users
from utils import int_field, str_field

log = logging.getLogger(__name__)


MAX_MESSAGE_LEN = 4000
MAX_REACTION_KINDS = 20  # distinct emoji per message


@socketio.on('message')
@authenticated
def handle_message(username, data):
    room = str_field(data, 'room')
    text = str_field(data, 'text').strip()[:MAX_MESSAGE_LEN]
    image_id = data.get('image')  # an upload of the sender's (see images.py); the text is optional then
    # Only sockets that passed the join checks (member / DM participant) are in the room.
    if not (text or image_id) or not in_room(room) or room == DEMO_ROOM:
        return
    if not check_msg_rate(username):
        emit('message_rate_limited', {'room': room})
        return
    if moderation.is_muted(room, username):
        emit('text_muted_notify', {'room': room})
        return
    participants = dm_participants(room)
    recipient = None
    if participants:
        recipient = participants[1] if participants[0] == username else participants[0]
        with get_db() as conn:
            cur = conn.cursor()
            if moderation.blocked_either_way(cur, username, recipient):
                emit('dm_blocked', {'room': room})
                return
            if not user_settings.may_message(cur, username, recipient, room):
                emit('dm_not_allowed', {'room': room})
                return

    # Built server-side: clients can't spoof the sender, display name or `system` flag.
    msg = {'username': username, 'screenname': username, 'room': room, 'text': text}
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT screenname, avatar_expression, avatar_color FROM users WHERE username = %s', (username,)
            )
            row = cur.fetchone()
            if row:
                msg['screenname'] = row['screenname']
                msg['avatar_expression'] = row.get('avatar_expression')
                msg['avatar_color'] = row.get('avatar_color')
            # A reply may only quote a real (non-system) message from this same room;
            # anything else is sent as a plain message
            reply_to, msg['reply'] = None, None
            wanted = data.get('reply_to')
            if isinstance(wanted, int) and not isinstance(wanted, bool):
                cur.execute(
                    'SELECT id, username, screenname, text, recalled FROM messages'
                    ' WHERE id = %s AND room = %s AND NOT COALESCE(system, FALSE)',
                    (wanted, room),
                )
                original = cur.fetchone()
                if original:
                    reply_to = original['id']
                    msg['reply'] = history.quote(
                        original['id'],
                        original['username'],
                        original['screenname'],
                        original['text'],
                        original['recalled'],
                    )
            # A photo must be the sender's own upload, not sent before
            image = images.attach(cur, image_id, username, room) if image_id else None
            if not image and not text:
                conn.rollback()
                emit('message_failed', {'room': room})
                return
            msg['meta'] = {'image': image} if image else None
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time, reply_to, meta)'
                ' VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at',
                (
                    room,
                    username,
                    msg['screenname'],
                    text,
                    datetime.now().strftime('%H:%M'),
                    reply_to,
                    json.dumps(msg['meta']) if image else None,
                ),
            )
            saved = cur.fetchone()
            if image:
                images.link(cur, image['id'], saved['id'], room)
            conn.commit()
        # The stored timestamp, not the clock now: clients resume history from it
        msg['id'], msg['time'] = saved['id'], saved['created_at'].isoformat()
    except Exception as e:
        # Never show a message that wasn't stored: it would vanish on reload
        log.exception('message save error: %s', e)
        emit('message_failed', {'room': room})
        return

    emit('message', msg, to=room)

    preview = text[:100] or '📷'
    if recipient:
        with get_db() as conn:
            cur = conn.cursor()
            # Muted this chat, or turned DM notifications off altogether
            muted = bool(chat_prefs.muted_by(cur, room, [recipient])) or not user_settings.wants_push(
                cur, [recipient], 'dms'
            )
        if recipient in online_users:
            for sid in list(online_users[recipient]):
                socketio.emit(
                    'new_dm_notification',
                    {
                        'dm_room': room,
                        'from_username': username,
                        'from_screenname': msg['screenname'],
                        'avatar_expression': msg.get('avatar_expression'),
                        'avatar_color': msg.get('avatar_color'),
                        # For the list's preview line: a brand-new DM isn't subscribed yet,
                        # so this is the only copy of the first message the list gets
                        'message_id': msg['id'],
                        'text': text[:120],
                        'image': bool(msg['meta']),
                    },
                    to=sid,
                )
        elif not muted:
            send_push(tokens_for([recipient]), msg['screenname'], preview, {'room': room})
        if not muted and not is_watching(recipient):
            # Opens this DM, with what the chat header shows about the sender
            query = urllib.parse.urlencode(
                {
                    'otherUsername': username,
                    'displayName': msg['screenname'],
                    'avatarExpression': msg.get('avatar_expression') or '',
                    'avatarColor': msg.get('avatar_color') or '',
                }
            )
            url = f'/room/{urllib.parse.quote(room, safe="")}?{query}'
            webpush.notify([recipient], msg['screenname'], preview, url, tag=room)
        return

    # Room message: push to offline members, except anyone who has blocked the sender
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT m FROM rooms, unnest(members) AS m WHERE name = %s AND m <> %s'
                ' AND m NOT IN (SELECT blocker FROM blocks WHERE blocked = %s)',
                (room, username, username),
            )
            offline = [r['m'] for r in cur.fetchall() if r['m'] not in online_users]
            muted = chat_prefs.muted_by(cur, room, offline)
            offline = [u for u in offline if u not in muted]
        send_push(tokens_for(offline), f'{msg["screenname"]} in {room}', preview, {'room': room})
    except Exception as e:
        log.exception('push notify error: %s', e)


@socketio.on('mark_read')
@authenticated
def handle_mark_read(username, data):
    """The client is looking at `room` and has seen up to message `id` (new arrivals while open)."""
    room = str_field(data, 'room')
    upto = data.get('id')
    if not in_room(room) or not isinstance(upto, int) or isinstance(upto, bool):
        return
    try:
        with get_db() as conn:
            reads.mark_read(conn.cursor(), username, room, upto)
            conn.commit()
    except Exception as e:
        log.exception('mark_read error: %s', e)


TYPING_MIN_GAP = 1.0  # seconds; clients send at most every 2 s, this caps a misbehaving one
_last_typing: dict[str, float] = {}


@socketio.on('typing')
@authenticated
def handle_typing(username, data):
    """ "Someone is typing" for a room or DM, relayed to the others there (never stored)."""
    room = str_field(data, 'room')
    if not in_room(room) or room == DEMO_ROOM or moderation.is_muted(room, username):
        return
    now = time.monotonic()
    if now - _last_typing.get(username, 0) < TYPING_MIN_GAP:
        return
    _last_typing[username] = now
    with get_db() as conn:
        cur = conn.cursor()
        participants = dm_participants(room)
        if participants:
            other = participants[1] if participants[0] == username else participants[0]
            if moderation.blocked_either_way(cur, username, other):
                return
        cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
        row = cur.fetchone()
    emit(
        'typing',
        {'room': room, 'username': username, 'screenname': row['screenname'] if row else username},
        to=room,
        include_self=False,
    )


@socketio.on('load_older')
@readable
def handle_load_older(username, data):
    """A page of history before `before_id`, for rooms/DMs this socket has joined."""
    room = data.get('room', '')
    before_id = data.get('before_id')
    if not in_room(room) or not isinstance(before_id, int):
        return
    try:
        with get_db() as conn:
            messages, has_more = history.older(conn.cursor(), room, before_id)
        emit('older_messages', {'room': room, 'messages': messages, 'has_more': has_more})
    except Exception as e:
        log.exception('load_older error: %s', e)


@socketio.on('recall_message')
@authenticated
def handle_recall_message(username, data):
    msg_id = int_field(data, 'id')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, room, recalled, text FROM messages WHERE id = %s', (msg_id,))
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
        if msg['username'] != username:  # someone else's message: a moderation step
            room_log.record(room, username, 'recall', msg['username'], text=(msg['text'] or '')[:80])
    except Exception as e:
        log.exception('recall_message error: %s', e)


@socketio.on('edit_message')
@authenticated
def handle_edit_message(username, data):
    msg_id = int_field(data, 'id')
    new_text = str_field(data, 'text').strip()[:MAX_MESSAGE_LEN]
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
            cur.execute('UPDATE messages SET text = %s, edited = true WHERE id = %s', (new_text, msg_id))
            conn.commit()
        emit('message_edited', {'id': msg_id, 'text': new_text, 'room': room}, to=room)
    except Exception as e:
        log.exception('edit_message error: %s', e)


@socketio.on('add_reaction')
@authenticated
def handle_add_reaction(username, data):
    msg_id = int_field(data, 'id')
    emoji = str_field(data, 'emoji').strip()
    if not msg_id or not emoji or len(emoji) > 16:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            # Row lock: two reactions arriving together must not overwrite each other
            cur.execute('SELECT room, reactions, recalled FROM messages WHERE id = %s FOR UPDATE', (msg_id,))
            msg = cur.fetchone()
            # Must be able to see the message to react to it
            if not msg or msg['recalled'] or not in_room(msg['room']) or msg['room'] == DEMO_ROOM:
                return
            room = msg['room']
            reactions = dict(msg.get('reactions') or {})
            users = list(reactions.get(emoji, []))
            if username in users:
                users.remove(username)
            elif emoji in reactions or len(reactions) < MAX_REACTION_KINDS:
                users.append(username)
            if users:
                reactions[emoji] = users
            else:
                reactions.pop(emoji, None)
            cur.execute('UPDATE messages SET reactions = %s WHERE id = %s', (json.dumps(reactions), msg_id))
            conn.commit()
        emit('reaction_updated', {'id': msg_id, 'reactions': reactions, 'room': room}, to=room)
    except Exception as e:
        log.exception('add_reaction error: %s', e)

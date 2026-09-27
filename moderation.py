"""Moderation actions shared by in-app room owners/admins and the admin panel.

Callers are responsible for permission checks; these functions do the work
(database + live notifications to connected clients).
"""
import logging
import re
import time

from extensions import socketio
from db import get_db
from state import online_users, rooms_text_muted, push_tokens, emit_system_msg
from auth_session import unbind

log = logging.getLogger(__name__)

# Usernames end up inside DM room ids ('dm:alice:bob') and admin-panel URLs
USERNAME_RE = re.compile(r'^[a-z0-9_]{3,20}$')
RESERVED_USERNAMES = {'system', 'admin'}  # 'system' authors system messages; 'admin' is not a chat account


def dm_room_id(a: str, b: str) -> str:
    return 'dm:' + ':'.join(sorted([a, b]))


def _screenname(cur, username: str) -> str:
    cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
    row = cur.fetchone()
    return row['screenname'] if row else username


def evict(username: str, room: str):
    """Remove all of a user's live sockets from a Socket.IO room."""
    for sid in list(online_users.get(username, [])):
        socketio.server.leave_room(sid, room, namespace='/')


# ── Rooms ─────────────────────────────────────────────────────

def kick(room: str, target: str) -> bool:
    """Remove `target` from the room and bar them from rejoining."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s),'
            " kicked = array_append(array_remove(COALESCE(kicked, '{}'), %s), %s)"
            ' WHERE name = %s RETURNING name',
            (target, target, target, target, room),
        )
        if not cur.fetchone():
            return False
        target_screen = _screenname(cur, target)
        conn.commit()
    for sid in list(online_users.get(target, [])):
        socketio.emit('kicked_from_room', {'room': room}, to=sid)
    evict(target, room)
    emit_system_msg(room, f'{target_screen} 被踢出了房间')
    return True


def unkick(room: str, target: str):
    """Allow a previously kicked user to join again."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE rooms SET kicked = array_remove(kicked, %s) WHERE name = %s', (target, room))
        conn.commit()


def mute(room: str, target: str, duration: int = 0):
    """Stop `target` from sending text in `room`; duration 0 = until unmuted."""
    expiry = None if duration <= 0 else time.time() + duration
    rooms_text_muted.setdefault(room, {})[target] = expiry
    socketio.emit('text_muted', {'target': target, 'duration': duration, 'room': room}, to=room)
    if expiry is not None:
        def auto_unmute():
            socketio.sleep(duration)
            if rooms_text_muted.get(room, {}).get(target) == expiry:
                unmute(room, target)
        socketio.start_background_task(auto_unmute)


def unmute(room: str, target: str):
    rooms_text_muted.get(room, {}).pop(target, None)
    socketio.emit('text_unmuted', {'target': target, 'room': room}, to=room)


def is_muted(room: str, username: str) -> bool:
    muted = rooms_text_muted.get(room, {})
    if username not in muted:
        return False
    expiry = muted[username]
    if expiry is None or expiry > time.time():
        return True
    del muted[username]
    return False


# ── Messages ──────────────────────────────────────────────────

def recall(msg_id) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE messages SET recalled = true WHERE id = %s AND recalled IS NOT TRUE RETURNING room',
                    (msg_id,))
        row = cur.fetchone()
        conn.commit()
    if not row:
        return False
    socketio.emit('message_recalled', {'id': msg_id, 'room': row['room']}, to=row['room'])
    return True


# ── Accounts ──────────────────────────────────────────────────

def username_available(cur, username: str) -> bool:
    if not USERNAME_RE.match(username) or username in RESERVED_USERNAMES:
        return False
    cur.execute('SELECT 1 FROM users WHERE username = %s'
                ' UNION SELECT 1 FROM deleted_usernames WHERE username = %s', (username, username))
    return cur.fetchone() is None


def delete_account(cur, username: str):
    """Remove a user. The name is retired so nobody can re-register it and
    inherit its DM history (DM rooms are keyed by username) or room ownership."""
    cur.execute('UPDATE rooms SET members = array_remove(members, %s),'
                ' admins = array_remove(admins, %s)', (username, username))
    cur.execute('DELETE FROM blocks WHERE blocker = %s OR blocked = %s', (username, username))
    cur.execute('DELETE FROM dm_closed WHERE username = %s', (username,))
    cur.execute('DELETE FROM users WHERE username = %s', (username,))
    cur.execute('INSERT INTO deleted_usernames (username) VALUES (%s) ON CONFLICT DO NOTHING', (username,))


def rename_user(old: str, new: str):
    """Change a username everywhere it is stored, including DM room ids.
    Returns an error message, or None on success. The user's live sessions are
    ended (their token names the old username) and the old name is retired."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT 1 FROM users WHERE username = %s', (old,))
        if not cur.fetchone():
            return '用户不存在'
        if not username_available(cur, new):
            return '新用户名无效或已被占用'

        cur.execute('UPDATE users SET username = %s WHERE username = %s', (new, old))
        cur.execute(
            'UPDATE rooms SET owner = CASE WHEN owner = %s THEN %s ELSE owner END,'
            ' members = array_replace(members, %s, %s), admins = array_replace(admins, %s, %s),'
            ' kicked = array_replace(kicked, %s, %s)',
            (old, new, old, new, old, new, old, new),
        )
        cur.execute('UPDATE messages SET username = %s WHERE username = %s', (new, old))

        # DM ids embed both usernames in sorted order, so each one is recomputed
        cur.execute("SELECT DISTINCT room FROM messages WHERE room LIKE %s OR room LIKE %s",
                    (f'dm:{old}:%', f'dm:%:{old}'))
        for row in cur.fetchall():
            parts = row['room'].split(':')
            if len(parts) != 3 or old not in parts[1:]:
                continue
            other = parts[2] if parts[1] == old else parts[1]
            new_room = dm_room_id(new, other)
            cur.execute('UPDATE messages SET room = %s WHERE room = %s', (new_room, row['room']))
            cur.execute('UPDATE dm_closed SET dm_room = %s WHERE dm_room = %s', (new_room, row['room']))
        cur.execute('UPDATE dm_closed SET username = %s WHERE username = %s', (new, old))

        cur.execute('UPDATE blocks SET blocker = %s WHERE blocker = %s', (new, old))
        cur.execute('UPDATE blocks SET blocked = %s WHERE blocked = %s', (new, old))
        cur.execute('UPDATE reports SET reporter = %s WHERE reporter = %s', (new, old))
        cur.execute('UPDATE reports SET reported = %s WHERE reported = %s', (new, old))
        cur.execute('UPDATE feedback SET username = %s WHERE username = %s', (new, old))
        cur.execute('INSERT INTO deleted_usernames (username) VALUES (%s) ON CONFLICT DO NOTHING', (old,))
        conn.commit()

    if old in push_tokens:
        push_tokens[new] = push_tokens.pop(old)
    for muted in rooms_text_muted.values():
        if old in muted:
            muted[new] = muted.pop(old)
    for sid in list(online_users.get(old, [])):
        socketio.emit('session_expired', {}, to=sid)
        unbind(sid)
    return None

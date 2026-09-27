"""Moderation actions shared by in-app room owners/admins and the admin panel.

Callers are responsible for permission checks; these functions do the work
(database + live notifications to connected clients).
"""

import logging
import re

from auth_session import unbind
from db import get_db
from extensions import socketio
from state import emit_system_msg, online_users, rooms_voice

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
    emit_system_msg(room, 'user_kicked', name=target_screen)
    return True


def unkick(room: str, target: str):
    """Allow a previously kicked user to join again."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE rooms SET kicked = array_remove(kicked, %s) WHERE name = %s', (target, room))
        conn.commit()


# Mutes and voice bans are rows in room_restrictions so they survive restarts.
# Expiry is checked on read; the timer below only pushes the live "lifted" event.
TEXT, VOICE = 'text', 'voice'
_LIFTED_EVENT = {TEXT: 'text_unmuted', VOICE: 'voice_unbanned'}


def restrict(room: str, target: str, kind: str, duration: int = 0):
    """Mute (kind='text') or voice-ban (kind='voice'); duration 0 = until lifted."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO room_restrictions (room, username, kind, expires_at)'
            ' VALUES (%s, %s, %s, CASE WHEN %s > 0 THEN NOW() + make_interval(secs => %s) END)'
            ' ON CONFLICT (room, username, kind) DO UPDATE SET expires_at = EXCLUDED.expires_at'
            ' RETURNING expires_at',
            (room, target, kind, duration, duration),
        )
        expires_at = cur.fetchone()['expires_at']
        conn.commit()
    if kind == TEXT:
        socketio.emit('text_muted', {'target': target, 'duration': duration, 'room': room}, to=room)
    else:
        members = rooms_voice.get(room, {}).get('voice_members', [])
        rooms_voice.get(room, {})['voice_members'] = [m for m in members if m['username'] != target]
        socketio.emit('voice_banned', {'target': target, 'room': room}, to=room)
        socketio.emit('voice_user_left', {'username': target, 'room': room}, to=room)
    if expires_at is not None:

        def lift_when_expired():
            socketio.sleep(duration)
            # Only if it wasn't replaced by a newer restriction meanwhile
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute(
                    'DELETE FROM room_restrictions WHERE room = %s AND username = %s AND kind = %s'
                    ' AND expires_at = %s RETURNING 1',
                    (room, target, kind, expires_at),
                )
                lifted = cur.fetchone()
                conn.commit()
            if lifted:
                socketio.emit(_LIFTED_EVENT[kind], {'target': target, 'room': room}, to=room)

        socketio.start_background_task(lift_when_expired)


def lift(room: str, target: str, kind: str):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'DELETE FROM room_restrictions WHERE room = %s AND username = %s AND kind = %s', (room, target, kind)
        )
        conn.commit()
    socketio.emit(_LIFTED_EVENT[kind], {'target': target, 'room': room}, to=room)


def is_restricted(room: str, username: str, kind: str) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT 1 FROM room_restrictions WHERE room = %s AND username = %s AND kind = %s'
            ' AND (expires_at IS NULL OR expires_at > NOW())',
            (room, username, kind),
        )
        return cur.fetchone() is not None


def restricted_users(room: str, kind: str) -> list:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT username FROM room_restrictions WHERE room = %s AND kind = %s'
            ' AND (expires_at IS NULL OR expires_at > NOW())',
            (room, kind),
        )
        return [r['username'] for r in cur.fetchall()]


def mute(room: str, target: str, duration: int = 0):
    restrict(room, target, TEXT, duration)


def unmute(room: str, target: str):
    lift(room, target, TEXT)


def is_muted(room: str, username: str) -> bool:
    return is_restricted(room, username, TEXT)


# ── Blocks ────────────────────────────────────────────────────


def blocked_either_way(cur, a: str, b: str) -> bool:
    cur.execute(
        'SELECT 1 FROM blocks WHERE (blocker = %s AND blocked = %s) OR (blocker = %s AND blocked = %s)', (a, b, b, a)
    )
    return cur.fetchone() is not None


# ── Messages ──────────────────────────────────────────────────


def recall(msg_id) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'UPDATE messages SET recalled = true WHERE id = %s AND recalled IS NOT TRUE RETURNING room', (msg_id,)
        )
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
    cur.execute(
        'SELECT 1 FROM users WHERE username = %s UNION SELECT 1 FROM deleted_usernames WHERE username = %s',
        (username, username),
    )
    return cur.fetchone() is None


def delete_account(cur, username: str):
    """Remove a user. The name is retired so nobody can re-register it and
    inherit its DM history (DM rooms are keyed by username) or room ownership."""
    cur.execute(
        'UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s)', (username, username)
    )
    cur.execute('DELETE FROM blocks WHERE blocker = %s OR blocked = %s', (username, username))
    cur.execute('DELETE FROM dm_closed WHERE username = %s', (username,))
    cur.execute('DELETE FROM push_tokens WHERE username = %s', (username,))
    cur.execute('DELETE FROM room_restrictions WHERE username = %s', (username,))
    cur.execute('DELETE FROM room_invites WHERE username = %s', (username,))
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
        cur.execute(
            'SELECT DISTINCT room FROM messages WHERE room LIKE %s OR room LIKE %s', (f'dm:{old}:%', f'dm:%:{old}')
        )
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
        cur.execute('UPDATE push_tokens SET username = %s WHERE username = %s', (new, old))
        cur.execute('UPDATE room_restrictions SET username = %s WHERE username = %s', (new, old))
        cur.execute('UPDATE room_invites SET username = %s WHERE username = %s', (new, old))
        cur.execute('UPDATE room_invites SET invited_by = %s WHERE invited_by = %s', (new, old))
        cur.execute('INSERT INTO deleted_usernames (username) VALUES (%s) ON CONFLICT DO NOTHING', (old,))
        conn.commit()

    for sid in list(online_users.get(old, [])):
        socketio.emit('session_expired', {}, to=sid)
        unbind(sid)
    return None

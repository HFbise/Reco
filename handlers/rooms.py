import json
import logging
import random
import string
from datetime import datetime

from flask_socketio import emit, join_room

import chat_prefs
import history
import moderation
import reads
import voice_state
from auth_session import authenticated, dm_participants, in_room, is_guest, readable
from db import get_db
from demo import DEMO_ROOM
from extensions import socketio
from replies import fail
from state import LOBBY, check_msg_rate, emit_system_msg, get_level, online_users
from utils import hash_password, int_field, str_field, verify_password

log = logging.getLogger(__name__)


def _gen_unique_room_code(cur) -> str:
    while True:
        code = ''.join(random.choices(string.digits, k=6))
        cur.execute('SELECT 1 FROM rooms WHERE code = %s', (code,))
        if not cur.fetchone():
            return code


def _build_members_data(cur, room_data: dict) -> list:
    owner = room_data.get('owner') or ''
    admins_set = set(room_data['admins'] or [])
    member_usernames = list(room_data['members'] or [])
    user_rows = {}
    if member_usernames:
        cur.execute(
            'SELECT username, screenname, avatar_expression, avatar_color FROM users WHERE username = ANY(%s)',
            (member_usernames,),
        )
        user_rows = {r['username']: r for r in cur.fetchall()}
    members = []
    for u in member_usernames:
        row = user_rows.get(u, {})
        members.append(
            {
                'username': u,
                'screenname': row.get('screenname', u),
                'is_admin': u in admins_set,
                'is_owner': u == owner,
                'is_online': u in online_users,
                'avatar_expression': row.get('avatar_expression') or 'Smile',
                'avatar_color': row.get('avatar_color') or '#5865F2',
            }
        )
    members.sort(key=lambda m: (0 if m['is_online'] else 1, m['screenname']))
    return members


MAX_ROOM_NAME_LEN = 32
MAX_REPORT_LEN = 500


def _needs_password(username: str, room_data: dict, invited: bool = False) -> bool:
    """Owner, room admins, existing members and invited users never need the room password."""
    if not room_data.get('password') or invited:
        return False
    return username not in (room_data.get('members') or []) and get_level(username, room_data) == 0


def _is_invited(cur, room: str, username: str) -> bool:
    cur.execute('SELECT 1 FROM room_invites WHERE room = %s AND username = %s', (room, username))
    return cur.fetchone() is not None


@socketio.on('create_room')
@authenticated
def handle_create_room(username, data):
    room = (data.get('room') or '').strip()
    password = (data.get('password') or '').strip() or None
    # 'dm:' is reserved for direct-message rooms
    if not room or len(room) > MAX_ROOM_NAME_LEN or room.lower().startswith('dm:'):
        fail('create_room_result', 'invalid_room_name', {'max': MAX_ROOM_NAME_LEN})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT name FROM rooms WHERE name = %s', (room,))
            if cur.fetchone():
                fail('create_room_result', 'room_exists')
                return
            code = _gen_unique_room_code(cur)
            cur.execute(
                'INSERT INTO rooms (name, admins, members, password, owner, code) VALUES (%s, %s, %s, %s, %s, %s)',
                (room, [], [], hash_password(password) if password else None, username, code),
            )
            conn.commit()
        emit(
            'create_room_result',
            {
                'success': True,
                'room': room,
                'has_password': bool(password),
                'code': code,
            },
        )
        # Only the creator's own sessions (other devices) need this, not every user
        for sid in list(online_users.get(username, [])):
            socketio.emit('new_room_created', {'room': room, 'has_password': bool(password), 'owner': username}, to=sid)
    except Exception as e:
        log.exception('create_room error: %s', e)
        fail('create_room_result', 'server_error')


@socketio.on('join')
@readable
def handle_join(username, data):
    room = (data.get('room') or '').strip()
    if is_guest(username) and room != DEMO_ROOM:
        fail('join_result', 'guest_read_only', room=room)
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data:
                fail('join_result', 'room_not_found', room=room)
                return

            kicked = list(room_data.get('kicked') or [])
            if username in kicked:
                fail('join_result', 'kicked_from_room', room=room)
                return

            if _needs_password(username, room_data):
                if _is_invited(cur, room, username):
                    cur.execute('DELETE FROM room_invites WHERE room = %s AND username = %s', (room, username))
                else:
                    ok, needs_migrate = verify_password(room_data['password'], data.get('password') or '')
                    if not ok:
                        fail('join_result', 'wrong_password', room=room, wrong_password=True)
                        return
                    if needs_migrate:  # legacy plaintext room password
                        cur.execute(
                            'UPDATE rooms SET password = %s WHERE name = %s', (hash_password(data['password']), room)
                        )
                conn.commit()

            join_room(room)
            is_first_join = False
            if room != DEMO_ROOM and username not in (room_data['members'] or []):
                # Atomic append: two people joining at once must not overwrite each other
                cur.execute(
                    'UPDATE rooms SET members = array_append(members, %s)'
                    ' WHERE name = %s AND NOT (%s = ANY(COALESCE(members, ARRAY[]::text[]))) RETURNING members',
                    (username, room, username),
                )
                row = cur.fetchone()
                conn.commit()
                if row:
                    is_first_join = True
                    room_data['members'] = row['members']

            my_level = get_level(username, room_data)
            owner = room_data.get('owner') or ''
            admins_set = set(room_data['admins'] or [])
            members_data = _build_members_data(cur, room_data)
            room_code = room_data.get('code') or ''

            if not data.get('skip_history'):
                messages, reset = history.recent(cur, room, data.get('since'))
                if reset:
                    emit('history_reset', {'room': room})
                for msg in messages:
                    emit('message', msg)
                client_oldest = None if reset else data.get('oldest_id')
                has_older = history.has_older(cur, room, history.oldest_shown(messages, client_oldest))
                # Opened and shown: everything up to now counts as read (on every device)
                if not is_guest(username):
                    reads.mark_read(cur, username, room)
                    conn.commit()
            else:
                has_older = False

            # Get joiner screenname for system message
            joiner_screen = username
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            if row:
                joiner_screen = row['screenname']

        emit(
            'join_result',
            {
                'success': True,
                'room': room,
                'is_owner': username == owner,
                'is_admin': username in admins_set,
                'my_level': my_level,
                'members': members_data,
                'code': room_code,
                'is_first_join': is_first_join,
                'has_older': has_older,
                'has_password': bool(room_data.get('password')),
            },
        )
        emit('members_list', {'room': room, 'members': members_data}, to=room)

        if is_first_join:
            emit_system_msg(room, 'user_joined', name=joiner_screen)

        if voice_state.members(room):
            emit(
                'voice_members_view',
                {
                    'members': voice_state.members(room),
                    'banned': moderation.restricted_users(room, moderation.VOICE),
                    'room': room,
                },
            )
        for uname, sname in voice_state.streams(room).items():
            emit('stream_start', {'username': uname, 'screenname': sname, 'room': room})

    except Exception as e:
        log.exception('join error: %s', e)
        fail('join_result', 'server_error', room=room)


@socketio.on('leave_room')
@authenticated
def handle_leave_room(username, data):
    room = (data.get('room') or '').strip()
    if room == LOBBY:
        fail('leave_room_result', 'cannot_leave_lobby')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT members FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data:
                fail('leave_room_result', 'room_not_found')
                return
            was_member = username in (room_data['members'] or [])
            cur.execute(
                'UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s) WHERE name = %s',
                (username, username, room),
            )
            conn.commit()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            leaver_screen = row['screenname'] if row else username
        voice_state.remove_user(username, room)
        moderation.evict(username, room)
        emit('leave_room_result', {'success': True, 'room': room})
        if was_member:
            emit_system_msg(room, 'user_left', name=leaver_screen)
    except Exception as e:
        log.exception('leave_room error: %s', e)
        fail('leave_room_result', 'server_error')


@socketio.on('get_rooms')
@readable
def handle_get_rooms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if is_guest(username):
                cur.execute(
                    'SELECT name, password, code, owner, admins, members FROM rooms WHERE name = %s', (DEMO_ROOM,)
                )
            else:
                cur.execute(
                    'SELECT name, password, code, owner, admins, members FROM rooms WHERE name = %s OR %s = ANY(members)',
                    (LOBBY, username),
                )
            found = cur.fetchall()
            names = [r['name'] for r in found]
            unread = {} if is_guest(username) else reads.unread_counts(cur, username, names)
            prefs = {} if is_guest(username) else chat_prefs.for_user(cur, username, names)
            rooms = [
                {
                    'name': r['name'],
                    'has_password': bool(r['password']),
                    'needs_password': _needs_password(username, r),
                    'code': r.get('code') or '',
                    'unread': unread.get(r['name'], 0),
                    **prefs.get(r['name'], chat_prefs.DEFAULT),
                }
                for r in found
            ]
        lobby = next((r for r in rooms if r['name'] == LOBBY), None)
        if lobby:
            rooms.remove(lobby)
            rooms.insert(0, lobby)
        emit('rooms_list', {'rooms': rooms})
    except Exception as e:
        log.exception('get_rooms error: %s', e)
        emit('rooms_list', {'rooms': []})


@socketio.on('get_members')
@readable
def handle_get_members(_username, data):
    room = data.get('room')
    if not in_room(room):
        emit('members_list', {'room': room, 'members': []})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            members = _build_members_data(cur, room_data) if room_data else []
        emit('members_list', {'room': room, 'members': members})
    except Exception as e:
        log.exception('get_members error: %s', e)
        emit('members_list', {'room': room, 'members': []})


@socketio.on('kick_member')
@authenticated
def handle_kick_member(requester, data):
    target = str_field(data, 'target')
    room = str_field(data, 'room')
    try:
        if not moderation.can_moderate(room, requester, target):
            fail('kick_result', 'no_permission')
            return
        moderation.kick(room, target)
        emit('kick_result', {'success': True})
    except Exception as e:
        log.exception('kick_member error: %s', e)
        fail('kick_result', 'server_error')


@socketio.on('set_admin')
@authenticated
def handle_set_admin(requester, data):
    room, target = str_field(data, 'room'), str_field(data, 'target')
    remove = bool(data.get('remove'))
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data or get_level(requester, room_data) < 2 or get_level(target, room_data) >= 2:
                fail('set_admin_result', 'no_permission')
                return
            if target not in (room_data['members'] or []):
                fail('set_admin_result', 'user_not_in_room')
                return
            if remove:
                cur.execute('UPDATE rooms SET admins = array_remove(admins, %s) WHERE name = %s', (target, room))
            else:
                cur.execute(
                    'UPDATE rooms SET admins = array_append(admins, %s)'
                    ' WHERE name = %s AND NOT (%s = ANY(COALESCE(admins, ARRAY[]::text[])))',
                    (target, room, target),
                )
            conn.commit()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (target,))
            row = cur.fetchone()
            target_screen = row['screenname'] if row else target
        emit('set_admin_result', {'success': True, 'target': target, 'remove': remove})
        emit_system_msg(room, 'admin_removed' if remove else 'admin_added', name=target_screen)
    except Exception as e:
        log.exception('set_admin error: %s', e)
        fail('set_admin_result', 'server_error')


@socketio.on('set_room_password')
@authenticated
def handle_set_room_password(requester, data):
    room = str_field(data, 'room')
    password = str_field(data, 'password').strip() or None
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            if not row or get_level(requester, row) < 2:
                fail('set_room_password_result', 'no_permission')
                return
            cur.execute(
                'UPDATE rooms SET password = %s WHERE name = %s', (hash_password(password) if password else None, room)
            )
            conn.commit()
        emit('set_room_password_result', {'success': True})
        socketio.emit('room_password_changed', {'room': room, 'has_password': bool(password)}, to=room)
    except Exception as e:
        log.exception('set_room_password error: %s', e)
        fail('set_room_password_result', 'server_error')


@socketio.on('close_room')
@authenticated
def handle_close_room(requester, data):
    room = str_field(data, 'room')
    if not room or room == LOBBY:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT owner FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
        if not room_data or get_level(requester, room_data) < 2:
            fail('close_room_result', 'no_permission')
            return
        moderation.close_room(room)
        emit('close_room_result', {'success': True, 'room': room})
    except Exception as e:
        log.exception('close_room error: %s', e)
        fail('close_room_result', 'server_error')


@socketio.on('find_room')
@authenticated
def handle_find_room(username, data):
    code = str_field(data, 'code').strip()
    if not check_msg_rate(f'find_room:{username}', max_msgs=10, window=60):
        fail('find_room_result', 'too_many_attempts', {'secs': 60})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT name, password, code, owner, admins, members FROM rooms WHERE code = %s', (code,))
            room = cur.fetchone()
            invited = bool(room) and _is_invited(cur, room['name'], username)
        if not room:
            fail('find_room_result', 'room_code_not_found')
            return
        emit(
            'find_room_result',
            {
                'success': True,
                'room': room['name'],
                'has_password': bool(room['password']),
                'needs_password': _needs_password(username, room, invited),
                'code': room['code'],
            },
        )
    except Exception as e:
        log.exception('find_room error: %s', e)
        fail('find_room_result', 'server_error')


@socketio.on('room_subscribe')
@authenticated
def handle_room_subscribe(username, data):
    room = data.get('room', '')
    participants = dm_participants(room)
    if participants is not None:
        if username in participants:
            join_room(room)
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT members, kicked FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
        if row and username in (row['members'] or []) and username not in (row['kicked'] or []):
            join_room(room)
    except Exception as e:
        log.exception('room_subscribe error: %s', e)


@socketio.on('get_my_admin_rooms')
@authenticated
def handle_get_my_admin_rooms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT name, code FROM rooms WHERE owner = %s OR %s = ANY(admins)', (username, username))
            rooms = [{'name': r['name'], 'code': r.get('code') or ''} for r in cur.fetchall()]
        emit('my_admin_rooms', {'rooms': rooms})
    except Exception as e:
        log.exception('get_my_admin_rooms error: %s', e)
        emit('my_admin_rooms', {'rooms': []})


@socketio.on('invite_to_room')
@authenticated
def handle_invite_to_room(inviter, data):
    """Send a DM message with invite metadata to the target user."""
    target = data.get('target', '')
    room = data.get('room', '')
    if not target or target == inviter or not in_room(room):
        fail('invite_sent', 'no_permission')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)', ([inviter, target],))
            users = {u['username']: u['screenname'] for u in cur.fetchall()}
            if target not in users:
                fail('invite_sent', 'user_not_found')
                return
            if moderation.blocked_either_way(cur, inviter, target):
                fail('invite_sent', 'cannot_invite')
                return
            inviter_screen = users.get(inviter, inviter)
            cur.execute(
                'INSERT INTO room_invites (room, username, invited_by) VALUES (%s, %s, %s)'
                ' ON CONFLICT (room, username) DO UPDATE SET invited_by = EXCLUDED.invited_by, created_at = NOW()',
                (room, target, inviter),
            )
            cur.execute('SELECT code FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            room_code = row['code'] if row else ''
            dm_room = moderation.dm_room_id(inviter, target)
            meta = json.dumps({'invite': {'room': room, 'code': room_code}})
            text = f'{inviter_screen} 邀请你加入房间 {room}'
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time, meta)'
                ' VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING id, created_at',
                (dm_room, inviter, inviter_screen, text, datetime.now().strftime('%H:%M'), meta),
            )
            saved = cur.fetchone()
            conn.commit()
        msg_data = {
            'id': saved['id'],
            'username': inviter,
            'screenname': inviter_screen,
            'text': text,
            'time': saved['created_at'].isoformat(),
            'room': dm_room,
            'meta': {'invite': {'room': room, 'code': room_code}},
        }
        for u in [inviter, target]:
            for sid in list(online_users.get(u, [])):
                socketio.emit('message', msg_data, to=sid)
        emit('invite_sent', {'success': True})
    except Exception as e:
        log.exception('invite_to_room error: %s', e)
        fail('invite_sent', 'server_error')


# ── Text mute ─────────────────────────────────────────────────


@socketio.on('text_mute')
@authenticated
def handle_text_mute(requester, data):
    room, target = str_field(data, 'room'), str_field(data, 'target')
    if moderation.can_moderate(room, requester, target):
        moderation.mute(room, target, int_field(data, 'duration_seconds'))


@socketio.on('text_unmute')
@authenticated
def handle_text_unmute(requester, data):
    room, target = str_field(data, 'room'), str_field(data, 'target')
    if moderation.can_moderate(room, requester, target):
        moderation.unmute(room, target)


# ── Block / Report ────────────────────────────────────────────


@socketio.on('report_user')
@authenticated
def handle_report_user(reporter, data):
    reported = str_field(data, 'reported')
    reason = str_field(data, 'reason').strip()[:MAX_REPORT_LEN]
    if not reported or reporter == reported:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO reports (reporter, reported, reason) VALUES (%s, %s, %s)', (reporter, reported, reason)
            )
            conn.commit()
        emit('report_result', {'success': True})
    except Exception as e:
        log.exception('report_user error: %s', e)
        emit('report_result', {'success': False})


@socketio.on('block_user')
@authenticated
def handle_block_user(blocker, data):
    blocked = str_field(data, 'blocked')
    if not blocked or blocker == blocked:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO blocks (blocker, blocked) VALUES (%s, %s) ON CONFLICT DO NOTHING', (blocker, blocked)
            )
            conn.commit()
        emit('block_result', {'success': True, 'blocked': blocked})
    except Exception as e:
        log.exception('block_user error: %s', e)
        emit('block_result', {'success': False})


@socketio.on('unblock_user')
@authenticated
def handle_unblock_user(blocker, data):
    blocked = str_field(data, 'blocked')
    if not blocked:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('DELETE FROM blocks WHERE blocker = %s AND blocked = %s', (blocker, blocked))
            conn.commit()
        emit('unblock_result', {'success': True, 'unblocked': blocked})
    except Exception as e:
        log.exception('unblock_user error: %s', e)
        emit('unblock_result', {'success': False})


@socketio.on('get_blocked_users')
@readable
def handle_get_blocked_users(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT blocked FROM blocks WHERE blocker = %s', (username,))
            rows = cur.fetchall()
        emit('blocked_users_list', {'users': [r['blocked'] for r in rows]})
    except Exception as e:
        log.exception('get_blocked_users error: %s', e)
        emit('blocked_users_list', {'users': []})

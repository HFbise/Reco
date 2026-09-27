import json
import logging
import random
import string
from datetime import datetime, timezone
from flask_socketio import emit, join_room, leave_room, close_room
from extensions import socketio
from db import get_db
from state import (
    get_level,
    online_users, pending_invites, rooms_voice, rooms_stream,
    emit_system_msg,
)
from auth_session import authenticated, in_room, dm_participants

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
            'SELECT username, screenname, avatar_expression, avatar_color'
            ' FROM users WHERE username = ANY(%s)',
            (member_usernames,)
        )
        user_rows = {r['username']: r for r in cur.fetchall()}
    members = []
    for u in member_usernames:
        row = user_rows.get(u, {})
        members.append({
            'username': u,
            'screenname': row.get('screenname', u),
            'is_admin': u in admins_set,
            'is_owner': u == owner,
            'is_online': u in online_users,
            'avatar_expression': row.get('avatar_expression') or 'Smile',
            'avatar_color': row.get('avatar_color') or '#5865F2',
        })
    members.sort(key=lambda m: (0 if m['is_online'] else 1, m['screenname']))
    return members


MAX_ROOM_NAME_LEN = 32


def _evict(username: str, room: str):
    """Remove all of a user's sockets from a Socket.IO room (after kick)."""
    for sid in list(online_users.get(username, [])):
        leave_room(room, sid=sid, namespace='/')


def _needs_password(username: str, room_data: dict) -> bool:
    """Owner, room admins and existing members never need the room password."""
    if not room_data.get('password'):
        return False
    return username not in (room_data.get('members') or []) and get_level(username, room_data) == 0


@socketio.on('create_room')
@authenticated
def handle_create_room(username, data):
    room = (data.get('room') or '').strip()
    password = (data.get('password') or '').strip() or None
    # 'dm:' is reserved for direct-message rooms
    if not room or len(room) > MAX_ROOM_NAME_LEN or room.lower().startswith('dm:'):
        emit('create_room_result', {'success': False, 'msg': '房间名无效'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT name FROM rooms WHERE name = %s', (room,))
            if cur.fetchone():
                emit('create_room_result', {'success': False, 'msg': '房间已存在'})
                return
            code = _gen_unique_room_code(cur)
            cur.execute(
                'INSERT INTO rooms (name, admins, members, password, owner, code)'
                ' VALUES (%s, %s, %s, %s, %s, %s)',
                (room, [], [], password, username, code)
            )
            conn.commit()
        emit('create_room_result', {
            'success': True, 'room': room,
            'has_password': bool(password), 'code': code,
        })
        socketio.emit('new_room_created', {'room': room, 'has_password': bool(password), 'owner': username})
    except Exception as e:
        log.error('create_room error: %s', e)
        emit('create_room_result', {'success': False, 'msg': str(e)})


@socketio.on('join')
@authenticated
def handle_join(username, data):
    room = (data.get('room') or '').strip()
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data:
                emit('join_result', {'success': False, 'msg': '房间不存在'})
                return

            kicked = list(room_data.get('kicked') or [])
            if username in kicked:
                emit('join_result', {'success': False, 'msg': '你已被踢出该房间'})
                return

            room_pw = room_data.get('password')
            if _needs_password(username, room_data):
                invited = username in pending_invites.get(room, set())
                if invited:
                    pending_invites[room].discard(username)
                elif data.get('password', '') != room_pw:
                    emit('join_result', {'success': False, 'msg': '密码错误', 'wrong_password': True})
                    return

            join_room(room)
            members = list(room_data['members'] or [])
            is_first_join = username not in members
            if is_first_join:
                members.append(username)
                cur.execute('UPDATE rooms SET members = %s WHERE name = %s', (members, room))
                conn.commit()

            my_level = get_level(username, room_data)
            owner = room_data.get('owner') or ''
            admins_set = set(room_data['admins'] or [])
            members_data = _build_members_data(cur, room_data)
            room_code = room_data.get('code') or ''

            # History
            since = data.get('since')
            if not data.get('skip_history'):
                if since:
                    cur.execute(
                        'SELECT * FROM messages WHERE room = %s AND created_at > %s'
                        ' ORDER BY created_at ASC LIMIT 50',
                        (room, since)
                    )
                    history = cur.fetchall()
                else:
                    cur.execute(
                        'SELECT * FROM messages WHERE room = %s'
                        ' ORDER BY created_at DESC LIMIT 50',
                        (room,)
                    )
                    history = list(reversed(cur.fetchall()))
                for msg in history:
                    emit('message', {
                        'id': msg['id'],
                        'username': msg['username'],
                        'screenname': msg['screenname'],
                        'text': msg['text'],
                        'time': msg['created_at'].isoformat() if msg.get('created_at') else msg['time'],
                        'room': room,
                        'recalled': bool(msg.get('recalled')),
                        'edited': bool(msg.get('edited')),
                        'reactions': dict(msg.get('reactions') or {}),
                        'system': bool(msg.get('system')),
                        'meta': dict(msg['meta']) if msg.get('meta') else None,
                    })

            # Get joiner screenname for system message
            joiner_screen = username
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            if row:
                joiner_screen = row['screenname']

        emit('join_result', {
            'success': True, 'room': room,
            'is_owner': username == owner,
            'is_admin': username in admins_set,
            'my_level': my_level,
            'members': members_data,
            'code': room_code,
            'is_first_join': is_first_join,
        })
        emit('members_list', {'room': room, 'members': members_data}, to=room)

        if is_first_join:
            emit_system_msg(room, f'{joiner_screen} 加入了房间')

        if room in rooms_voice and rooms_voice[room].get('voice_members'):
            emit('voice_members_view', {
                'members': rooms_voice[room]['voice_members'],
                'banned': list(rooms_voice[room].get('voice_banned', {}).keys()),
            })
        for uname, sname in rooms_stream.get(room, {}).items():
            emit('stream_start', {'username': uname, 'screenname': sname, 'room': room})

    except Exception as e:
        log.error('join error: %s', e)
        emit('join_result', {'success': False, 'msg': str(e)})


@socketio.on('leave_room')
@authenticated
def handle_leave_room(username, data):
    room = (data.get('room') or '').strip()
    if room == '大厅':
        emit('leave_room_result', {'success': False, 'msg': '无法退出大厅'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT members, admins FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data:
                emit('leave_room_result', {'success': False, 'msg': '房间不存在'})
                return
            members = list(room_data['members'] or [])
            admins = list(room_data['admins'] or [])
            changed = False
            if username in members:
                members.remove(username)
                cur.execute('UPDATE rooms SET members = %s WHERE name = %s', (members, room))
                changed = True
            if username in admins:
                admins.remove(username)
                cur.execute('UPDATE rooms SET admins = %s WHERE name = %s', (admins, room))
                changed = True
            if changed:
                conn.commit()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            leaver_screen = row['screenname'] if row else username
        _evict(username, room)
        emit('leave_room_result', {'success': True, 'room': room})
        emit_system_msg(room, f'{leaver_screen} 离开了房间')
    except Exception as e:
        log.error('leave_room error: %s', e)
        emit('leave_room_result', {'success': False, 'msg': str(e)})


@socketio.on('get_rooms')
@authenticated
def handle_get_rooms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT name, password, code, owner, admins, members FROM rooms"
                " WHERE name = '大厅' OR %s = ANY(members)",
                (username,)
            )
            rooms = [{'name': r['name'], 'has_password': bool(r['password']),
                      'needs_password': _needs_password(username, r),
                      'code': r.get('code') or ''} for r in cur.fetchall()]
        lobby = next((r for r in rooms if r['name'] == '大厅'), None)
        if lobby:
            rooms.remove(lobby)
            rooms.insert(0, lobby)
        emit('rooms_list', {'rooms': rooms})
    except Exception as e:
        log.error('get_rooms error: %s', e)
        emit('rooms_list', {'rooms': []})


@socketio.on('get_members')
@authenticated
def handle_get_members(_username, data):
    if not in_room(data.get('room')):
        emit('members_list', {'members': []})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
            if not room_data:
                emit('members_list', {'members': []})
                return
            members = _build_members_data(cur, room_data)
        emit('members_list', {'members': members})
    except Exception as e:
        log.error('get_members error: %s', e)
        emit('members_list', {'members': []})


@socketio.on('kick_member')
@authenticated
def handle_kick_member(requester, data):
    target = data.get('target', '')
    room = data.get('room', '')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data:
                return
            req_level = get_level(requester, room_data)
            tgt_level = get_level(target, room_data)
            if req_level < 1 or req_level <= tgt_level:
                emit('kick_result', {'success': False, 'msg': '无权限'})
                return
            members = list(room_data['members'] or [])
            if target in members:
                members.remove(target)
            kicked = list(room_data.get('kicked') or [])
            if target not in kicked:
                kicked.append(target)
            cur.execute('UPDATE rooms SET members = %s, kicked = %s WHERE name = %s',
                        (members, kicked, room))
            conn.commit()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (target,))
            row = cur.fetchone()
            target_screen = row['screenname'] if row else target
        if target in online_users:
            for sid in list(online_users[target]):
                socketio.emit('kicked_from_room', {'room': room}, to=sid)
            _evict(target, room)
        emit_system_msg(room, f'{target_screen} 被踢出了房间')
        emit('kick_result', {'success': True})
    except Exception as e:
        log.error('kick_member error: %s', e)
        emit('kick_result', {'success': False, 'msg': str(e)})


@socketio.on('set_admin')
@authenticated
def handle_set_admin(requester, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
            if not room_data:
                emit('set_admin_result', {'success': False, 'msg': '无权限'})
                return
            req_level = get_level(requester, room_data)
            tgt_level = get_level(data['target'], room_data)
            remove = data.get('remove', False)
            if req_level < 2 or tgt_level >= 2:
                emit('set_admin_result', {'success': False, 'msg': '无权限'})
                return
            if data['target'] not in (room_data['members'] or []):
                emit('set_admin_result', {'success': False, 'msg': '该用户不在房间内'})
                return
            admins = list(room_data['admins'] or [])
            if remove:
                if data['target'] in admins:
                    admins.remove(data['target'])
                    cur.execute('UPDATE rooms SET admins = %s WHERE name = %s',
                                (admins, data['room']))
                    conn.commit()
            else:
                if data['target'] not in admins:
                    admins.append(data['target'])
                    cur.execute('UPDATE rooms SET admins = %s WHERE name = %s',
                                (admins, data['room']))
                    conn.commit()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (data['target'],))
            row = cur.fetchone()
            target_screen = row['screenname'] if row else data['target']
        action = f"{target_screen} 被取消了管理员" if remove else f"{target_screen} 成为了管理员"
        emit('set_admin_result', {'success': True, 'target': data['target'], 'remove': remove})
        emit_system_msg(data['room'], action)
    except Exception as e:
        log.error('set_admin error: %s', e)
        emit('set_admin_result', {'success': False, 'msg': str(e)})


@socketio.on('set_room_password')
@authenticated
def handle_set_room_password(requester, data):
    room = data.get('room', '')
    password = data.get('password') or None
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            if not row or get_level(requester, row) < 2:
                emit('set_room_password_result', {'success': False, 'msg': '无权限'})
                return
            cur.execute('UPDATE rooms SET password = %s WHERE name = %s', (password, room))
            conn.commit()
        emit('set_room_password_result', {'success': True})
        socketio.emit('room_password_changed', {'room': room, 'has_password': bool(password)})
    except Exception as e:
        log.error('set_room_password error: %s', e)
        emit('set_room_password_result', {'success': False, 'msg': str(e)})


@socketio.on('close_room')
@authenticated
def handle_close_room(requester, data):
    if data.get('room') == '大厅':
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
            if not room_data or get_level(requester, room_data) < 2:
                emit('close_room_result', {'success': False, 'msg': '无权限'})
                return
            emit('message', {'screenname': '系统', 'text': '房间已被管理员关闭', 'system': True},
                 to=data['room'])
            emit('room_closed', {}, to=data['room'])
            cur.execute('DELETE FROM rooms WHERE name = %s', (data['room'],))
            cur.execute('DELETE FROM messages WHERE room = %s', (data['room'],))
            conn.commit()
        close_room(data['room'])
    except Exception as e:
        log.error('close_room error: %s', e)


@socketio.on('find_room')
@authenticated
def handle_find_room(username, data):
    code = data.get('code', '').strip()
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT name, password, code, owner, admins, members FROM rooms WHERE code = %s', (code,))
            room = cur.fetchone()
        if not room:
            emit('find_room_result', {'success': False, 'msg': '找不到该房间号'})
            return
        emit('find_room_result', {
            'success': True, 'room': room['name'],
            'has_password': bool(room['password']),
            'needs_password': _needs_password(username, room), 'code': room['code'],
        })
    except Exception as e:
        log.error('find_room error: %s', e)
        emit('find_room_result', {'success': False, 'msg': str(e)})


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
        log.error('room_subscribe error: %s', e)


@socketio.on('get_my_admin_rooms')
@authenticated
def handle_get_my_admin_rooms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT name, code FROM rooms WHERE owner = %s OR %s = ANY(admins)",
                (username, username)
            )
            rooms = [{'name': r['name'], 'code': r.get('code') or ''} for r in cur.fetchall()]
        emit('my_admin_rooms', {'rooms': rooms})
    except Exception as e:
        log.error('get_my_admin_rooms error: %s', e)
        emit('my_admin_rooms', {'rooms': []})


@socketio.on('invite_to_room')
@authenticated
def handle_invite_to_room(inviter, data):
    """Send a DM message with invite metadata to the target user."""
    target = data.get('target', '')
    room = data.get('room', '')
    if not target or target == inviter or not in_room(room):
        emit('invite_sent', {'success': False, 'msg': '无权限'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)',
                        ([inviter, target],))
            users = {u['username']: u['screenname'] for u in cur.fetchall()}
            if target not in users:
                emit('invite_sent', {'success': False, 'msg': '用户不存在'})
                return
            inviter_screen = users.get(inviter, inviter)
            cur.execute('SELECT code FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            room_code = row['code'] if row else ''
            dm_room = 'dm:' + ':'.join(sorted([inviter, target]))
            meta = json.dumps({'invite': {'room': room, 'code': room_code}})
            text = f'{inviter_screen} 邀请你加入房间 {room}'
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time, meta)'
                ' VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING id',
                (dm_room, inviter, inviter_screen, text,
                 datetime.now().strftime('%H:%M'), meta)
            )
            msg_id = cur.fetchone()['id']
            conn.commit()
        msg_data = {
            'id': msg_id, 'username': inviter, 'screenname': inviter_screen,
            'text': text, 'time': datetime.now(timezone.utc).isoformat(),
            'room': dm_room,
            'meta': {'invite': {'room': room, 'code': room_code}},
        }
        for u in [inviter, target]:
            for sid in list(online_users.get(u, [])):
                socketio.emit('message', msg_data, to=sid)
        emit('invite_sent', {'success': True})
    except Exception as e:
        log.error('invite_to_room error: %s', e)
        emit('invite_sent', {'success': False, 'msg': str(e)})


# ── Text mute ─────────────────────────────────────────────────

@socketio.on('text_mute')
@authenticated
def handle_text_mute(requester, data):
    from state import rooms_text_muted
    import time
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
        if not room_data:
            return
        req_level = get_level(requester, room_data)
        tgt_level = get_level(data['target'], room_data)
        if req_level < 1 or req_level <= tgt_level:
            return
    except Exception:
        return
    room = data['room']
    target = data['target']
    duration = int(data.get('duration_seconds', 0))
    rooms_text_muted.setdefault(room, {})
    expiry = None if duration == 0 else time.time() + duration
    rooms_text_muted[room][target] = expiry
    emit('text_muted', {'target': target, 'duration': duration}, to=room)
    if duration > 0:
        def auto_unmute(r=room, t=target, e=expiry):
            socketio.sleep(duration)
            if r in rooms_text_muted and rooms_text_muted[r].get(t) == e:
                del rooms_text_muted[r][t]
                socketio.emit('text_unmuted', {'target': t}, to=r)
        socketio.start_background_task(auto_unmute)


@socketio.on('text_unmute')
@authenticated
def handle_text_unmute(requester, data):
    from state import rooms_text_muted
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
        req_level = get_level(requester, room_data) if room_data else 0
        tgt_level = get_level(data['target'], room_data) if room_data else 0
        if not room_data or req_level < 1 or req_level <= tgt_level:
            return
    except Exception:
        return
    room = data['room']
    if room in rooms_text_muted:
        rooms_text_muted[room].pop(data['target'], None)
    emit('text_unmuted', {'target': data['target']}, to=room)


# ── Block / Report ────────────────────────────────────────────

@socketio.on('report_user')
@authenticated
def handle_report_user(reporter, data):
    reported = data.get('reported', '')
    reason = data.get('reason', '').strip()
    if not reporter or not reported or reporter == reported:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('INSERT INTO reports (reporter, reported, reason) VALUES (%s, %s, %s)',
                        (reporter, reported, reason))
            conn.commit()
        emit('report_result', {'success': True})
    except Exception as e:
        log.error('report_user error: %s', e)
        emit('report_result', {'success': False})


@socketio.on('block_user')
@authenticated
def handle_block_user(blocker, data):
    blocked = data.get('blocked', '')
    if not blocker or not blocked or blocker == blocked:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO blocks (blocker, blocked) VALUES (%s, %s) ON CONFLICT DO NOTHING',
                (blocker, blocked)
            )
            conn.commit()
        emit('block_result', {'success': True, 'blocked': blocked})
    except Exception as e:
        log.error('block_user error: %s', e)
        emit('block_result', {'success': False})


@socketio.on('unblock_user')
@authenticated
def handle_unblock_user(blocker, data):
    blocked = data.get('blocked', '')
    if not blocker or not blocked:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('DELETE FROM blocks WHERE blocker = %s AND blocked = %s',
                        (blocker, blocked))
            conn.commit()
        emit('unblock_result', {'success': True, 'unblocked': blocked})
    except Exception as e:
        log.error('unblock_user error: %s', e)
        emit('unblock_result', {'success': False})


@socketio.on('get_blocked_users')
@authenticated
def handle_get_blocked_users(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT blocked FROM blocks WHERE blocker = %s', (username,))
            rows = cur.fetchall()
        emit('blocked_users_list', {'users': [r['blocked'] for r in rows]})
    except Exception as e:
        log.error('get_blocked_users error: %s', e)
        emit('blocked_users_list', {'users': []})

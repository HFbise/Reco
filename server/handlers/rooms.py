"""Rooms themselves: creating, finding by code, joining, leaving, listing, closing.

What admins do to members is in room_moderation.py, invites in invites.py, a room's
settings in room_admin.py; who may get in is decided by room_access.py.
"""

import logging

from flask_socketio import emit, join_room

import chat_prefs
import history
import moderation
import reads
import room_access
import voice_state
from auth_session import authenticated, dm_participants, in_room, is_guest, readable
from db import get_db
from demo import DEMO_ROOM
from extensions import socketio
from replies import fail
from state import LOBBY, check_msg_rate, emit_system_msg, get_level, online_users
from utils import digest, hash_password, str_field

log = logging.getLogger(__name__)

FIND_ATTEMPTS_PER_MINUTE = 10  # room codes are short: guessing them must be slow


def _room(cur, name: str):
    cur.execute('SELECT * FROM rooms WHERE name = %s', (name,))
    return cur.fetchone()


@socketio.on('create_room')
@authenticated
def handle_create_room(username, data):
    room = str_field(data, 'room').strip()
    password = str_field(data, 'password').strip() or None
    if not room_access.valid_name(room):
        fail('create_room_result', 'invalid_room_name', {'max': room_access.MAX_NAME_LEN})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if _room(cur, room):
                fail('create_room_result', 'room_exists')
                return
            code = room_access.new_code(cur)
            cur.execute(
                'INSERT INTO rooms (name, admins, members, password, owner, code) VALUES (%s, %s, %s, %s, %s, %s)',
                (room, [], [], hash_password(password) if password else None, username, code),
            )
            conn.commit()
        emit('create_room_result', {'success': True, 'room': room, 'has_password': bool(password), 'code': code})
        # The creator's other devices list it too (and nobody else hears about it)
        for sid in list(online_users.get(username, [])):
            socketio.emit('new_room_created', {'room': room, 'has_password': bool(password), 'owner': username}, to=sid)
    except Exception as e:
        log.exception('create_room error: %s', e)
        fail('create_room_result', 'server_error')


@socketio.on('find_room')
@authenticated
def handle_find_room(username, data):
    """A room by its code, and whether getting in will need its password."""
    code = str_field(data, 'code').strip()
    if not check_msg_rate(f'find_room:{username}', max_msgs=FIND_ATTEMPTS_PER_MINUTE, window=60):
        fail('find_room_result', 'too_many_attempts', {'secs': 60})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE code = %s', (code,))
            row = cur.fetchone()
            invited = bool(row) and room_access.has_invite(cur, row['name'], username)
        if not row:
            fail('find_room_result', 'room_code_not_found')
            return
        if room_access.invite_only_for(username, row) and not invited:
            fail('find_room_result', 'invite_only')
            return
        emit(
            'find_room_result',
            {
                'success': True,
                'room': row['name'],
                'has_password': bool(row['password']),
                'needs_password': room_access.needs_password(username, row, invited),
                'code': row['code'],
            },
        )
    except Exception as e:
        log.exception('find_room error: %s', e)
        fail('find_room_result', 'server_error')


# ── joining ───────────────────────────────────────────────────


def _become_member(cur, username: str, row: dict) -> bool:
    """Add `username` to the members (not of the demo room); True if they weren't one."""
    if row['name'] == DEMO_ROOM or username in (row['members'] or []):
        return False
    # Atomic append: two people joining at once must not overwrite each other
    cur.execute(
        'UPDATE rooms SET members = array_append(members, %s)'
        ' WHERE name = %s AND NOT (%s = ANY(COALESCE(members, ARRAY[]::text[]))) RETURNING members',
        (username, row['name'], username),
    )
    added = cur.fetchone()
    if added:
        row['members'] = added['members']
    return bool(added)


def _send_history(cur, username: str, room: str, data: dict) -> bool:
    """The latest page (from `since`, if the client has some cached); returns whether older exists.
    Shown means read, on every device (the caller asks what was new first: reads.unread_from)."""
    messages, reset = history.recent(cur, room, data.get('since'))
    if reset:
        emit('history_reset', {'room': room})
    for msg in messages:
        emit('message', msg)
    oldest = history.oldest_shown(messages, None if reset else data.get('oldest_id'))
    if not is_guest(username):
        reads.mark_read(cur, username, room)
    return history.has_older(cur, room, oldest)


def _send_voice_and_streams(room: str):
    """Who is in the room's voice channel and who is sharing a screen, for a new arrival."""
    if voice_state.members(room):
        emit(
            'voice_members_view',
            {
                'members': voice_state.members(room),
                'banned': moderation.restricted_users(room, moderation.VOICE),
                'room': room,
            },
        )
    for username, screenname in voice_state.streams(room).items():
        emit('stream_start', {'username': username, 'screenname': screenname, 'room': room})


@socketio.on('join')
@readable
def handle_join(username, data):
    """Open a room: let them in (or say why not), make them a member, send the latest history."""
    room = str_field(data, 'room').strip()
    if is_guest(username) and room != DEMO_ROOM:
        fail('join_result', 'guest_read_only', room=room)
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            row = _room(cur, room)
            # A room made under a reserved name before it was reserved can't be opened
            if not row or room_access.reserved(room):
                fail('join_result', 'room_not_found', room=room)
                return
            refused = room_access.admit(cur, username, row, str_field(data, 'password'))
            if refused:
                fail(
                    'join_result',
                    refused,
                    room=room,
                    **({'wrong_password': True} if refused == 'wrong_password' else {}),
                )
                return
            join_room(room)
            first_time = _become_member(cur, username, row)
            conn.commit()
            unread = None if is_guest(username) or first_time else reads.unread_from(cur, username, room)
            has_older = False if data.get('skip_history') else _send_history(cur, username, room, data)
            conn.commit()
            members = room_access.members_view(cur, row)
            screenname = moderation.screenname(cur, username)
        emit(
            'join_result',
            {
                'success': True,
                'room': room,
                'is_owner': username == (row.get('owner') or ''),
                'is_admin': username in (row['admins'] or []),
                'my_level': get_level(username, row),
                'members': members,
                'code': row.get('code') or '',
                'is_first_join': first_time,
                'has_older': has_older,
                'has_password': bool(row.get('password')),
                'unread': unread,
            },
        )
        emit('members_list', {'room': room, 'members': members}, to=room)
        if first_time:
            emit_system_msg(room, 'user_joined', name=screenname)
        _send_voice_and_streams(room)
    except Exception as e:
        log.exception('join error: %s', e)
        fail('join_result', 'server_error', room=room)


@socketio.on('room_subscribe')
@authenticated
def handle_room_subscribe(username, data):
    """Live messages for a chat without opening it (a DM that just started, a room in the list)."""
    room = str_field(data, 'room')
    participants = dm_participants(room)
    if participants is not None:
        if username in participants:
            join_room(room)
        return
    try:
        with get_db() as conn:
            allowed = room_access.can_see(conn.cursor(), username, room)
        if allowed:
            join_room(room)
    except Exception as e:
        log.exception('room_subscribe error: %s', e)


# ── leaving and closing ───────────────────────────────────────


@socketio.on('leave_room')
@authenticated
def handle_leave_room(username, data):
    room = str_field(data, 'room').strip()
    if room == LOBBY:
        fail('leave_room_result', 'cannot_leave_lobby')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            row = _room(cur, room)
            if not row:
                fail('leave_room_result', 'room_not_found')
                return
            was_member = username in (row['members'] or [])
            cur.execute(
                'UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s) WHERE name = %s',
                (username, username, room),
            )
            conn.commit()
            screenname = moderation.screenname(cur, username)
        voice_state.remove_user(username, room)
        moderation.evict(username, room)
        emit('leave_room_result', {'success': True, 'room': room})
        if was_member:
            emit_system_msg(room, 'user_left', name=screenname)
    except Exception as e:
        log.exception('leave_room error: %s', e)
        fail('leave_room_result', 'server_error')


@socketio.on('close_room')
@authenticated
def handle_close_room(requester, data):
    """The owner deletes the room, its messages and everything about it, for everyone."""
    room = str_field(data, 'room')
    if not room or room == LOBBY:
        return
    try:
        with get_db() as conn:
            row = _room(conn.cursor(), room)
        if not row or get_level(requester, row) < 2:
            fail('close_room_result', 'no_permission')
            return
        moderation.close_room(room)
        emit('close_room_result', {'success': True, 'room': room})
    except Exception as e:
        log.exception('close_room error: %s', e)
        fail('close_room_result', 'server_error')


# ── lists ─────────────────────────────────────────────────────


@socketio.on('get_rooms')
@readable
def handle_get_rooms(username, data):
    """Your rooms (the lobby first), with unread counts, unread @mentions of you, and your pins and
    mutes. Guests: the demo room. A client that already holds this very list (its `digest`, from
    last time) is told {unchanged: true} instead of being sent it again."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if is_guest(username):
                cur.execute('SELECT * FROM rooms WHERE name = %s', (DEMO_ROOM,))
            else:
                cur.execute('SELECT * FROM rooms WHERE name = %s OR %s = ANY(members)', (LOBBY, username))
            found = [
                r for r in cur.fetchall() if username not in (r['kicked'] or []) and not room_access.reserved(r['name'])
            ]
            names = [r['name'] for r in found]
            unread = {} if is_guest(username) else reads.unread_counts(cur, username, names)
            mentioned = set() if is_guest(username) else reads.mentioned_in(cur, username, names)
            prefs = {} if is_guest(username) else chat_prefs.for_user(cur, username, names)
        rooms = [
            {
                'name': r['name'],
                'has_password': bool(r['password']),
                'needs_password': room_access.needs_password(username, r),
                'code': r.get('code') or '',
                'unread': unread.get(r['name'], 0),
                'mentioned': r['name'] in mentioned,
                **prefs.get(r['name'], chat_prefs.DEFAULT),
            }
            for r in found
        ]
        rooms.sort(key=lambda r: r['name'] != LOBBY)  # stable: otherwise the database's order
        if not is_guest(username):
            # Live messages for every room in the list (unread counts, @mentions), opened or not
            for r in rooms:
                join_room(r['name'])
        fingerprint = digest(rooms)
        if data.get('digest') == fingerprint:
            emit('rooms_list', {'unchanged': True, 'digest': fingerprint})
        else:
            emit('rooms_list', {'rooms': rooms, 'digest': fingerprint})
    except Exception as e:
        log.exception('get_rooms error: %s', e)
        emit('rooms_list', {'rooms': []})


@socketio.on('get_members')
@readable
def handle_get_members(_username, data):
    room = str_field(data, 'room')
    members = []
    if in_room(room):
        try:
            with get_db() as conn:
                cur = conn.cursor()
                row = _room(cur, room)
                members = room_access.members_view(cur, row) if row else []
        except Exception as e:
            log.exception('get_members error: %s', e)
    emit('members_list', {'room': room, 'members': members})

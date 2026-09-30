"""A room's settings for its owner and admins: description and announcement, who may join,
who is kicked or muted (and undoing it), and the moderation log.

Levels (state.get_level): 2 owner, 1 room admin, 0 member. Everyone in the room reads the
description and announcement; admins edit them and see the ban list and log; only the owner
decides how people join.
"""

import logging

from flask_socketio import emit

import moderation
import room_log
from auth_session import authenticated, in_room, readable
from db import get_db
from extensions import socketio
from replies import fail
from state import LOBBY, emit_system_msg, get_level
from utils import hash_password, int_field, str_field

log = logging.getLogger(__name__)

MAX_DESCRIPTION_LEN = 300
MAX_ANNOUNCEMENT_LEN = 1000
JOIN_MODES = ('open', 'password', 'invite')


def _room(cur, room: str):
    cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
    return cur.fetchone()


def _screenname(cur, username: str | None) -> str | None:
    if not username:
        return None
    cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
    row = cur.fetchone()
    return row['screenname'] if row else username


def details(cur, row: dict) -> dict:
    """What the room card shows about a room."""
    announcement = None
    if row.get('announcement'):
        announcement = {
            'text': row['announcement'],
            'by': _screenname(cur, row.get('announcement_by')),
            'time': row['announcement_at'].isoformat() if row.get('announcement_at') else None,
        }
    return {
        'room': row['name'],
        'description': row.get('description') or '',
        'announcement': announcement,
        'join_mode': 'invite' if row.get('invite_only') else 'password' if row.get('password') else 'open',
    }


def _broadcast(cur, room: str):
    socketio.emit('room_details', details(cur, _room(cur, room)), to=room)


@socketio.on('get_room_details')
@readable
def handle_get_room_details(username, data):
    room = str_field(data, 'room')
    if not in_room(room):
        return
    with get_db() as conn:
        cur = conn.cursor()
        row = _room(cur, room)
        if row:
            emit('room_details', details(cur, row))


@socketio.on('update_room_info')
@authenticated
def handle_update_room_info(username, data):
    """Owner and admins: the description and/or the announcement (empty clears it)."""
    room = str_field(data, 'room')
    fields = {k: data[k].strip() for k in ('description', 'announcement') if isinstance(data.get(k), str)}
    limits = {'description': MAX_DESCRIPTION_LEN, 'announcement': MAX_ANNOUNCEMENT_LEN}
    for key, value in fields.items():
        if len(value) > limits[key]:
            fail('update_room_info_result', 'text_too_long', {'max': limits[key]})
            return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            row = _room(cur, room)
            if not row or get_level(username, row) < 1:
                fail('update_room_info_result', 'no_permission')
                return
            changed = [k for k, v in fields.items() if v != (row.get(k) or '')]
            if 'description' in changed:
                cur.execute('UPDATE rooms SET description = %s WHERE name = %s', (fields['description'] or None, room))
            if 'announcement' in changed:
                cur.execute(
                    'UPDATE rooms SET announcement = %s, announcement_by = %s, announcement_at = NOW() WHERE name = %s',
                    (fields['announcement'] or None, username, room),
                )
            conn.commit()
            screen = _screenname(cur, username)
            _broadcast(cur, room)
        emit('update_room_info_result', {'success': True})
        for key in changed:
            room_log.record(room, username, key)
        if 'announcement' in changed and fields['announcement']:
            emit_system_msg(room, 'announcement_updated', name=screen)
    except Exception as e:
        log.exception('update_room_info error: %s', e)
        fail('update_room_info_result', 'server_error')


@socketio.on('set_join_mode')
@authenticated
def handle_set_join_mode(username, data):
    """Owner only: anyone with the code ('open'), with the password too, or only people invited."""
    room = str_field(data, 'room')
    mode = str_field(data, 'mode')
    password = str_field(data, 'password').strip()
    if mode not in JOIN_MODES or room == LOBBY:
        fail('set_join_mode_result', 'invalid_join_mode')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            row = _room(cur, room)
            if not row or get_level(username, row) < 2:
                fail('set_join_mode_result', 'no_permission')
                return
            if mode == 'password' and not password and not row.get('password'):
                fail('set_join_mode_result', 'password_required')
                return
            # A new password replaces the old; keeping 'password' without typing one keeps it
            new_hash = hash_password(password) if password else row.get('password')
            cur.execute(
                'UPDATE rooms SET invite_only = %s, password = %s WHERE name = %s',
                (mode == 'invite', new_hash if mode == 'password' else None, room),
            )
            conn.commit()
            _broadcast(cur, room)
        emit('set_join_mode_result', {'success': True, 'mode': mode})
        socketio.emit('room_password_changed', {'room': room, 'has_password': mode == 'password'}, to=room)
        room_log.record(room, username, 'join_mode', mode=mode)
    except Exception as e:
        log.exception('set_join_mode error: %s', e)
        fail('set_join_mode_result', 'server_error')


@socketio.on('get_room_bans')
@authenticated
def handle_get_room_bans(username, data):
    """Owner and admins: who is kicked, muted or kept out of voice here."""
    room = str_field(data, 'room')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            row = _room(cur, room)
            if not row or get_level(username, row) < 1:
                fail('room_bans', 'no_permission', room=room)
                return
            kicked = list(row.get('kicked') or [])
            cur.execute(
                'SELECT username, kind, expires_at FROM room_restrictions WHERE room = %s'
                ' AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY username',
                (room,),
            )
            restrictions = cur.fetchall()
            everyone = kicked + [r['username'] for r in restrictions]
            names = {}
            if everyone:
                cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)', (everyone,))
                names = {r['username']: r['screenname'] for r in cur.fetchall()}

        def person(name, expires_at=None):
            return {
                'username': name,
                'screenname': names.get(name, name),
                'until': expires_at.isoformat() if expires_at else None,
            }

        emit(
            'room_bans',
            {
                'success': True,
                'room': room,
                'kicked': [person(u) for u in sorted(kicked)],
                'muted': [person(r['username'], r['expires_at']) for r in restrictions if r['kind'] == moderation.TEXT],
                'voice_banned': [
                    person(r['username'], r['expires_at']) for r in restrictions if r['kind'] == moderation.VOICE
                ],
            },
        )
    except Exception as e:
        log.exception('get_room_bans error: %s', e)
        fail('room_bans', 'server_error', room=room)


@socketio.on('unkick_member')
@authenticated
def handle_unkick_member(username, data):
    """Owner and admins: let a kicked person join again."""
    room, target = str_field(data, 'room'), str_field(data, 'target')
    with get_db() as conn:
        row = _room(conn.cursor(), room)
    if not row or get_level(username, row) < 1 or target not in (row.get('kicked') or []):
        fail('unkick_result', 'no_permission')
        return
    moderation.unkick(room, target)
    room_log.record(room, username, 'unkick', target)
    emit('unkick_result', {'success': True, 'target': target})


@socketio.on('get_room_log')
@authenticated
def handle_get_room_log(username, data):
    room = str_field(data, 'room')
    with get_db() as conn:
        cur = conn.cursor()
        row = _room(cur, room)
        if not row or get_level(username, row) < 1:
            fail('room_log', 'no_permission', room=room)
            return
        entries, has_more = room_log.page(cur, room, int_field(data, 'before_id'))
    emit('room_log', {'success': True, 'room': room, 'entries': entries, 'has_more': has_more})

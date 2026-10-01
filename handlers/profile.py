"""People's cards (profiles.py) and the nicknames you give people."""

import logging

from flask_socketio import emit

import profiles
import voice_state
from auth_session import authenticated, in_room, is_guest, readable
from db import get_db
from extensions import socketio
from replies import fail
from state import online_users
from utils import str_field

log = logging.getLogger(__name__)


@socketio.on('get_profile_card')
@readable
def handle_get_profile_card(username, data):
    """Someone's card, opened from `room` if given (a room or DM this socket is in)."""
    target = str_field(data, 'username')
    room = str_field(data, 'room')
    room = room if room and not room.startswith('dm:') and in_room(room) else None
    in_voice = bool(room) and any(m['username'] == target for m in voice_state.members(room))
    with get_db() as conn:
        found = profiles.card(conn.cursor(), username, target, room, in_voice, is_guest(username))
    if found:
        emit('profile_card', found)
    else:
        fail('profile_card', 'user_not_found', username=target)


@socketio.on('get_nicknames')
@authenticated
def handle_get_nicknames(username, data):
    with get_db() as conn:
        emit('nicknames', {'nicknames': profiles.nicknames(conn.cursor(), username)})


@socketio.on('set_nickname')
@authenticated
def handle_set_nickname(username, data):
    """Name someone for yourself ('' clears it); all your devices get the new list."""
    target = str_field(data, 'username')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if not profiles.set_nickname(cur, username, target, str_field(data, 'nickname')):
                fail('nickname_result', 'user_not_found')
                return
            conn.commit()
            names = profiles.nicknames(cur, username)
    except Exception as e:
        log.exception('set_nickname error: %s', e)
        fail('nickname_result', 'server_error')
        return
    for sid in list(online_users.get(username, [])):
        socketio.emit('nicknames', {'nicknames': names}, to=sid)

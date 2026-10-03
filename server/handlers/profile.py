"""About people (profiles.py): your own settings, people's cards, and the nicknames you give them."""

import logging

from flask_socketio import emit

import profiles
import voice_state
from auth_session import MEMBERS_ROOM, authenticated, in_room, is_guest, readable
from db import get_db
from extensions import socketio
from replies import fail
from state import invisible, online_users
from utils import str_field

log = logging.getLogger(__name__)


def _to_all_devices(username: str, event: str, payload: dict):
    for sid in list(online_users.get(username, [])):
        socketio.emit(event, payload, to=sid)


def _show_online(username: str, show: bool):
    """Appear (or vanish) for everyone at once, if connected right now."""
    if username not in online_users or show == (username not in invisible):
        return
    # The moment they appear or vanish is the last time they were seen
    with get_db() as conn:
        profiles.touch_last_seen(conn.cursor(), username)
        conn.commit()
    if show:
        invisible.discard(username)
    else:
        invisible.add(username)
    socketio.emit('online_status_changed', {'username': username, 'online': show}, to=MEMBERS_ROOM)


@socketio.on('get_settings')
@authenticated
def handle_get_settings(username, data):
    with get_db() as conn:
        emit('settings', profiles.get(conn.cursor(), username))


@socketio.on('update_settings')
@authenticated
def handle_update_settings(username, data):
    changes = profiles.clean(data)
    if not changes:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            settings = profiles.update(cur, username, changes)
            conn.commit()
    except Exception as e:
        log.exception('update_settings error: %s', e)
        fail('settings_result', 'server_error')
        return
    if 'show_online' in changes:
        _show_online(username, settings['show_online'])
    _to_all_devices(username, 'settings', settings)


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
    _to_all_devices(username, 'nicknames', {'nicknames': names})

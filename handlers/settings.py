"""Your own settings that follow you to every device (see user_settings.py)."""

import logging

from flask_socketio import emit

import user_settings
from auth_session import MEMBERS_ROOM, authenticated
from db import get_db
from extensions import socketio
from replies import fail
from state import invisible, online_users

log = logging.getLogger(__name__)


def _to_all_devices(username: str, settings: dict):
    for sid in list(online_users.get(username, [])):
        socketio.emit('settings', settings, to=sid)


def _show_online(username: str, show: bool):
    """Appear (or vanish) for everyone at once, if connected right now."""
    if username not in online_users or show == (username not in invisible):
        return
    # The moment they appear or vanish is the last time they were seen
    with get_db() as conn:
        user_settings.touch_last_seen(conn.cursor(), username)
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
        emit('settings', user_settings.get(conn.cursor(), username))


@socketio.on('update_settings')
@authenticated
def handle_update_settings(username, data):
    changes = user_settings.clean(data)
    if not changes:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            settings = user_settings.update(cur, username, changes)
            conn.commit()
    except Exception as e:
        log.exception('update_settings error: %s', e)
        fail('settings_result', 'server_error')
        return
    if 'show_online' in changes:
        _show_online(username, settings['show_online'])
    _to_all_devices(username, settings)

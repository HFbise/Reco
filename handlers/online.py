import logging

from flask import request
from flask_socketio import emit

import voice_state
from auth_session import bind, new_guest, readable, unbind, verify_token
from extensions import socketio

log = logging.getLogger(__name__)


@socketio.on('connect')
def handle_connect(auth=None):
    # Unauthenticated sockets are allowed (login / register / forgot password),
    # they just can't call any @authenticated handler.
    token = (auth or {}).get('token') if isinstance(auth, dict) else None
    if not token:
        return
    try:
        username = verify_token(token)
    except Exception as e:
        log.exception('verify_token error: %s', e)
        return
    if username:
        bind(username)
        emit('session_ready', {'username': username})
    else:
        emit('session_expired', {})


@socketio.on('guest_login')
def handle_guest_login(data=None):
    """Start a read-only demo session (no account). See demo.py."""
    unbind(request.sid)
    guest, token = new_guest()
    bind(guest)
    emit('guest_login_result', {'success': True, 'username': guest, 'token': token})


@socketio.on('user_offline')
@readable
def handle_user_offline(username, data):
    unbind(request.sid)


@socketio.on('disconnect')
def handle_disconnect(*_args):
    from handlers import match  # imported lazily: both modules load via handlers/__init__

    sid = request.sid
    username = unbind(sid)
    match.on_disconnect(username, sid)
    voice_state.leave_sid(sid)

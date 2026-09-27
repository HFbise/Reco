import logging

from flask import request
from flask_socketio import emit

from auth_session import bind, new_guest, readable, unbind, verify_token
from extensions import socketio
from state import rooms_voice, sid_to_voice

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


@socketio.on('user_online')
@readable
def handle_user_online(username, data):
    # Kept for older clients; binding already marks the user online.
    pass


@socketio.on('user_offline')
@readable
def handle_user_offline(username, data):
    unbind(request.sid)


@socketio.on('disconnect')
def handle_disconnect(*_args):
    sid = request.sid
    unbind(sid)
    if sid in sid_to_voice:
        username, room = sid_to_voice.pop(sid)
        if room in rooms_voice:
            rooms_voice[room]['voice_members'] = [
                m for m in rooms_voice[room]['voice_members'] if m['username'] != username
            ]
        socketio.emit('voice_user_left', {'username': username, 'room': room}, to=room)

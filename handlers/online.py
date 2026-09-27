import logging
from flask import request
from flask_socketio import emit
from extensions import socketio
from state import sid_to_voice, rooms_voice
from auth_session import verify_token, bind, unbind, authenticated

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


@socketio.on('user_online')
@authenticated
def handle_user_online(username, data):
    # Kept for older clients; binding already marks the user online.
    pass


@socketio.on('user_offline')
@authenticated
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

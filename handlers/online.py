import logging
from flask import request
from extensions import socketio
from state import online_users, sid_to_voice, rooms_voice

log = logging.getLogger(__name__)


@socketio.on('user_online')
def handle_user_online(data):
    username = data['username']
    online_users.setdefault(username, set()).add(request.sid)
    socketio.emit('online_status_changed', {'username': username, 'online': True})


@socketio.on('user_offline')
def handle_user_offline(data):
    username = data['username']
    if username in online_users:
        online_users[username].discard(request.sid)
        if not online_users[username]:
            del online_users[username]
            socketio.emit('online_status_changed', {'username': username, 'online': False})


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    for username, sids in list(online_users.items()):
        if sid in sids:
            sids.discard(sid)
            if not sids:
                del online_users[username]
                socketio.emit('online_status_changed', {'username': username, 'online': False})
            break
    if sid in sid_to_voice:
        username, room = sid_to_voice.pop(sid)
        if room in rooms_voice:
            rooms_voice[room]['voice_members'] = [
                m for m in rooms_voice[room]['voice_members'] if m['username'] != username
            ]
        socketio.emit('voice_user_left', {'username': username, 'room': room}, to=room)

import logging
import time
from flask import request
from flask_socketio import emit
from extensions import socketio
from state import rooms_voice, rooms_stream, sid_to_voice

log = logging.getLogger(__name__)


@socketio.on('voice_join')
def handle_voice_join(data):
    username = data['username']
    screenname = data.get('screenname', username)
    room = data['room']
    avatar_expression = data.get('avatar_expression', 'Smile')
    avatar_color = data.get('avatar_color', '#5865F2')

    if room not in rooms_voice:
        rooms_voice[room] = {'voice_members': [], 'voice_banned': {}}
    banned = rooms_voice[room]['voice_banned']
    if username in banned:
        expiry = banned[username]
        if expiry is None or expiry > time.time():
            emit('voice_banned', {'target': username})
            return
        del banned[username]

    if not any(m['username'] == username for m in rooms_voice[room]['voice_members']):
        rooms_voice[room]['voice_members'].append({
            'username': username, 'screenname': screenname,
            'avatar_expression': avatar_expression, 'avatar_color': avatar_color,
        })
    sid_to_voice[request.sid] = (username, room)
    emit('voice_user_joined', {
        'username': username, 'screenname': screenname,
        'avatar_expression': avatar_expression, 'avatar_color': avatar_color,
        'room': room,
    }, to=room)
    emit('voice_current_members', {'members': rooms_voice[room]['voice_members']})


@socketio.on('voice_leave')
def handle_voice_leave(data):
    username = data['username']
    room = data['room']
    if room in rooms_voice:
        rooms_voice[room]['voice_members'] = [
            m for m in rooms_voice[room]['voice_members'] if m['username'] != username
        ]
    sid_to_voice.pop(request.sid, None)
    emit('voice_user_left', {'username': username, 'room': room}, to=room)


@socketio.on('voice_offer')
def handle_voice_offer(data):
    emit('voice_offer', data, to=data['room'])


@socketio.on('voice_answer')
def handle_voice_answer(data):
    emit('voice_answer', data, to=data['room'])


@socketio.on('voice_ice')
def handle_voice_ice(data):
    emit('voice_ice', data, to=data['room'])


@socketio.on('voice_mute_status')
def handle_voice_mute(data):
    emit('voice_mute_status', data, to=data['room'])


@socketio.on('voice_speaking')
def handle_voice_speaking(data):
    emit('voice_speaking', data, to=data['room'])


@socketio.on('ping_check')
def handle_ping_check(data):
    emit('pong_check', data)


@socketio.on('voice_ban')
def handle_voice_ban(data):
    from db import get_db
    from state import get_level
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
        req_level = get_level(data['username'], room_data) if room_data else 0
        tgt_level = get_level(data['target'], room_data) if room_data else 0
        if req_level < 1 or req_level <= tgt_level:
            return
    except Exception:
        return
    room = data['room']
    target = data['target']
    duration = int(data.get('duration_seconds', 0))
    rooms_voice.setdefault(room, {'voice_members': [], 'voice_banned': {}})
    expiry = None if duration == 0 else time.time() + duration
    rooms_voice[room]['voice_banned'][target] = expiry
    emit('voice_banned', {'target': target}, to=room)
    if duration > 0:
        def auto_unban(r=room, t=target, e=expiry):
            socketio.sleep(duration)
            if r in rooms_voice and rooms_voice[r]['voice_banned'].get(t) == e:
                del rooms_voice[r]['voice_banned'][t]
                socketio.emit('voice_unbanned', {'target': t}, to=r)
        socketio.start_background_task(auto_unban)


@socketio.on('voice_unban')
def handle_voice_unban(data):
    from db import get_db
    from state import get_level
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
            room_data = cur.fetchone()
        req_level = get_level(data['username'], room_data) if room_data else 0
        tgt_level = get_level(data['target'], room_data) if room_data else 0
        if not room_data or req_level < 1 or req_level <= tgt_level:
            return
    except Exception:
        return
    room = data['room']
    if room in rooms_voice:
        rooms_voice[room]['voice_banned'].pop(data['target'], None)
    emit('voice_unbanned', {'target': data['target']}, to=room)


@socketio.on('stream_start')
def handle_stream_start(data):
    room = data.get('room')
    if room:
        rooms_stream.setdefault(room, {})[data['username']] = data.get('screenname', data['username'])
        emit('stream_start', data, to=room, include_self=False)


@socketio.on('stream_stop')
def handle_stream_stop(data):
    room = data.get('room')
    if room:
        rooms_stream.get(room, {}).pop(data.get('username'), None)
        emit('stream_stop', data, to=room, include_self=False)


@socketio.on('stream_audio_start')
def handle_stream_audio_start(data):
    room = data.get('room')
    if room:
        emit('stream_audio_start', data, to=room, include_self=False)


@socketio.on('stream_audio_stop')
def handle_stream_audio_stop(data):
    room = data.get('room')
    if room:
        emit('stream_audio_stop', data, to=room, include_self=False)

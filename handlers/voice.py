import logging

from flask import request
from flask_socketio import emit

import moderation
from auth_session import authenticated, in_room
from db import get_db
from extensions import socketio
from state import get_level, rooms_stream, rooms_voice, sid_to_voice

log = logging.getLogger(__name__)


def _relay(event: str, username: str, data: dict, sender_key: str, **kwargs):
    """Forward a signaling/status event to the room, stamping the real sender."""
    room = data.get('room')
    if not in_room(room):
        return
    data[sender_key] = username
    emit(event, data, to=room, **kwargs)


def _room_levels(room: str, requester: str, target: str):
    """(requester_level, target_level), or None if the room doesn't exist."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
        room_data = cur.fetchone()
    if not room_data:
        return None
    return get_level(requester, room_data), get_level(target, room_data)


@socketio.on('voice_join')
@authenticated
def handle_voice_join(username, data):
    room = data.get('room')
    if not in_room(room):
        return
    screenname, avatar_expression, avatar_color = username, 'Smile', '#5865F2'
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT screenname, avatar_expression, avatar_color FROM users WHERE username = %s', (username,)
            )
            row = cur.fetchone()
        if row:
            screenname = row['screenname']
            avatar_expression = row.get('avatar_expression') or avatar_expression
            avatar_color = row.get('avatar_color') or avatar_color
    except Exception as e:
        log.exception('voice_join profile error: %s', e)

    if moderation.is_restricted(room, username, moderation.VOICE):
        emit('voice_banned', {'target': username, 'room': room})
        return
    rooms_voice.setdefault(room, {'voice_members': []})

    if not any(m['username'] == username for m in rooms_voice[room]['voice_members']):
        rooms_voice[room]['voice_members'].append(
            {
                'username': username,
                'screenname': screenname,
                'avatar_expression': avatar_expression,
                'avatar_color': avatar_color,
            }
        )
    sid_to_voice[request.sid] = (username, room)
    emit(
        'voice_user_joined',
        {
            'username': username,
            'screenname': screenname,
            'avatar_expression': avatar_expression,
            'avatar_color': avatar_color,
            'room': room,
        },
        to=room,
    )
    emit('voice_current_members', {'members': rooms_voice[room]['voice_members']})


@socketio.on('voice_leave')
@authenticated
def handle_voice_leave(username, data):
    room = data.get('room')
    if room in rooms_voice:
        rooms_voice[room]['voice_members'] = [
            m for m in rooms_voice[room]['voice_members'] if m['username'] != username
        ]
    sid_to_voice.pop(request.sid, None)
    if room:
        emit('voice_user_left', {'username': username, 'room': room}, to=room)


@socketio.on('voice_offer')
@authenticated
def handle_voice_offer(username, data):
    _relay('voice_offer', username, data, 'from')


@socketio.on('voice_answer')
@authenticated
def handle_voice_answer(username, data):
    _relay('voice_answer', username, data, 'from')


@socketio.on('voice_ice')
@authenticated
def handle_voice_ice(username, data):
    _relay('voice_ice', username, data, 'from')


@socketio.on('voice_mute_status')
@authenticated
def handle_voice_mute(username, data):
    _relay('voice_mute_status', username, data, 'username')


@socketio.on('voice_speaking')
@authenticated
def handle_voice_speaking(username, data):
    _relay('voice_speaking', username, data, 'username')


@socketio.on('ping_check')
def handle_ping_check(data):
    emit('pong_check', data)


@socketio.on('voice_ban')
@authenticated
def handle_voice_ban(requester, data):
    room = data.get('room')
    target = data.get('target')
    try:
        levels = _room_levels(room, requester, target)
    except Exception:
        return
    if not levels or levels[0] < 1 or levels[0] <= levels[1]:
        return
    moderation.restrict(room, target, moderation.VOICE, int(data.get('duration_seconds', 0)))


@socketio.on('voice_unban')
@authenticated
def handle_voice_unban(requester, data):
    room = data.get('room')
    target = data.get('target')
    try:
        levels = _room_levels(room, requester, target)
    except Exception:
        return
    if not levels or levels[0] < 1 or levels[0] <= levels[1]:
        return
    moderation.lift(room, target, moderation.VOICE)


@socketio.on('stream_start')
@authenticated
def handle_stream_start(username, data):
    room = data.get('room')
    if not in_room(room):
        return
    screenname = username
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
        if row:
            screenname = row['screenname']
    except Exception as e:
        log.exception('stream_start profile error: %s', e)
    rooms_stream.setdefault(room, {})[username] = screenname
    data['screenname'] = screenname
    _relay('stream_start', username, data, 'username', include_self=False)


@socketio.on('stream_stop')
@authenticated
def handle_stream_stop(username, data):
    room = data.get('room')
    if room:
        rooms_stream.get(room, {}).pop(username, None)
    _relay('stream_stop', username, data, 'username', include_self=False)


@socketio.on('stream_audio_start')
@authenticated
def handle_stream_audio_start(username, data):
    _relay('stream_audio_start', username, data, 'username', include_self=False)


@socketio.on('stream_audio_stop')
@authenticated
def handle_stream_audio_stop(username, data):
    _relay('stream_audio_stop', username, data, 'username', include_self=False)

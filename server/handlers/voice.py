import logging

from flask import request
from flask_socketio import emit

import moderation
import room_access
import voice_state
from auth_session import authenticated, dm_participants, in_room
from db import get_db
from extensions import socketio

log = logging.getLogger(__name__)


def _profile(username: str) -> dict:
    member = {'username': username, 'screenname': username, 'avatar_expression': 'Smile', 'avatar_color': '#5865F2'}
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT screenname, avatar_expression, avatar_color FROM users WHERE username = %s', (username,)
            )
            row = cur.fetchone()
        if row:
            member['screenname'] = row['screenname']
            member['avatar_expression'] = row.get('avatar_expression') or member['avatar_expression']
            member['avatar_color'] = row.get('avatar_color') or member['avatar_color']
    except Exception as e:
        log.exception('voice profile error: %s', e)
    return member


def _to_peer(event: str, username: str, data: dict):
    """WebRTC signaling goes only to the peer it's for. Offers and ICE candidates
    contain network addresses, so they must not be broadcast to the whole room."""
    room, target = data.get('room'), data.get('to')
    if not in_room(room) or request.sid not in voice_state.sids(username, room):
        return
    data['from'] = username
    for sid in voice_state.sids(target, room):
        emit(event, data, to=sid)


def _to_room(event: str, username: str, data: dict, include_self: bool = True):
    """Voice status (mute, speaking, streams) for everyone in the room, stamped with the real sender."""
    room = data.get('room')
    if not in_room(room):
        return
    data['username'] = username
    emit(event, data, to=room, include_self=include_self)


def _enter(username: str, room) -> bool:
    """Voice can arrive before the room rejoin after a reconnect, and on a phone it can outlive
    the chat screen that would rejoin the room: a member's socket is let in (DMs have no voice)."""
    return dm_participants(room) is None and room_access.enter(username, room)


@socketio.on('voice_join')
@authenticated
def handle_voice_join(username, data):
    room = data.get('room')
    if not _enter(username, room):
        return
    if moderation.is_restricted(room, username, moderation.VOICE):
        emit('voice_banned', {'target': username, 'room': room})
        return
    member = _profile(username)
    voice_state.join(request.sid, room, member)
    emit('voice_user_joined', {**member, 'room': room}, to=room)
    emit('voice_current_members', {'members': voice_state.members(room)})


@socketio.on('voice_leave')
@authenticated
def handle_voice_leave(username, data):
    voice_state.leave_sid(request.sid)


@socketio.on('voice_offer')
@authenticated
def handle_voice_offer(username, data):
    _to_peer('voice_offer', username, data)


@socketio.on('voice_answer')
@authenticated
def handle_voice_answer(username, data):
    _to_peer('voice_answer', username, data)


@socketio.on('voice_ice')
@authenticated
def handle_voice_ice(username, data):
    _to_peer('voice_ice', username, data)


@socketio.on('voice_mute_status')
@authenticated
def handle_voice_mute(username, data):
    if isinstance(data.get('muted'), bool) and in_room(data.get('room')):
        voice_state.set_flag(data['room'], username, 'isMuted', data['muted'])
    _to_room('voice_mute_status', username, data)


@socketio.on('voice_speaking')
@authenticated
def handle_voice_speaking(username, data):
    if isinstance(data.get('speaking'), bool) and in_room(data.get('room')):
        voice_state.set_flag(data['room'], username, 'isSpeaking', data['speaking'])
    _to_room('voice_speaking', username, data)


@socketio.on('ping_check')
def handle_ping_check(data=None):
    emit('pong_check', data)


@socketio.on('stream_start')
@authenticated
def handle_stream_start(username, data):
    room = data.get('room')
    # Only someone in the voice channel can share: viewers receive it over the voice connections
    if not in_room(room) or request.sid not in voice_state.sids(username, room):
        return
    screenname = _profile(username)['screenname']
    voice_state.start_stream(room, username, screenname)
    data['screenname'] = screenname
    _to_room('stream_start', username, data, include_self=False)


@socketio.on('stream_stop')
@authenticated
def handle_stream_stop(username, data):
    room = data.get('room')
    if in_room(room):
        voice_state.stop_stream(room, username)
    _to_room('stream_stop', username, data, include_self=False)


@socketio.on('stream_audio_start')
@authenticated
def handle_stream_audio_start(username, data):
    _to_room('stream_audio_start', username, data, include_self=False)


@socketio.on('stream_audio_stop')
@authenticated
def handle_stream_audio_stop(username, data):
    _to_room('stream_audio_stop', username, data, include_self=False)

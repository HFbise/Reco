"""Who is in which voice channel, and who is screen sharing.

The one place that changes voice state, so joining, leaving, disconnecting,
being kicked or voice-banned, and closing the tab all clean up the same way.
The dicts themselves live in state.py (in-process, lost on restart).
"""

from extensions import socketio
from state import rooms_stream, rooms_voice, sid_to_voice


def members(room: str) -> list:
    return rooms_voice.get(room, {}).get('voice_members', [])


def streams(room: str) -> dict:
    """{username: screenname} of everyone sharing their screen in `room`."""
    return dict(rooms_stream.get(room, {}))


def sids(username: str, room: str) -> list:
    """The sockets `username` is in `room`'s voice channel from."""
    return [sid for sid, (user, r) in list(sid_to_voice.items()) if user == username and r == room]


def set_flag(room: str, username: str, key: str, value: bool):
    """Remember a member's isSpeaking / isMuted, so whoever joins or opens the room later sees
    it too (the change itself is only announced once)."""
    for m in members(room):
        if m['username'] == username:
            m[key] = value


def join(sid: str, room: str, member: dict):
    """Put this socket in `room`'s voice channel (leaving any other one first)."""
    current = sid_to_voice.get(sid)
    if current and current[1] != room:
        leave_sid(sid)
    channel = rooms_voice.setdefault(room, {'voice_members': []})
    if not any(m['username'] == member['username'] for m in channel['voice_members']):
        channel['voice_members'].append(member)
    sid_to_voice[sid] = (member['username'], room)


def leave_sid(sid: str):
    """This socket leaves voice; the user leaves the channel unless another of
    their sockets is still in it."""
    entry = sid_to_voice.pop(sid, None)
    if not entry:
        return
    username, room = entry
    if not sids(username, room):
        _remove(username, room)


def remove_user(username: str, room: str):
    """Take `username` out of `room`'s voice channel on every device."""
    for sid in sids(username, room):
        sid_to_voice.pop(sid, None)
    _remove(username, room)


def close(room: str):
    """The room is gone: forget its voice channel and streams."""
    for sid in [sid for sid, (_, r) in list(sid_to_voice.items()) if r == room]:
        sid_to_voice.pop(sid, None)
    rooms_voice.pop(room, None)
    rooms_stream.pop(room, None)


def start_stream(room: str, username: str, screenname: str):
    rooms_stream.setdefault(room, {})[username] = screenname


def stop_stream(room: str, username: str) -> bool:
    streams = rooms_stream.get(room, {})
    stopped = streams.pop(username, None) is not None
    if not streams:
        rooms_stream.pop(room, None)
    return stopped


def _remove(username: str, room: str):
    channel = rooms_voice.get(room)
    if channel:
        channel['voice_members'] = [m for m in channel['voice_members'] if m['username'] != username]
        if not channel['voice_members']:
            rooms_voice.pop(room, None)
    # A screen share can't outlive its sender's voice connection
    if stop_stream(room, username):
        socketio.emit('stream_stop', {'username': username, 'room': room}, to=room)
    socketio.emit('voice_user_left', {'username': username, 'room': room}, to=room)

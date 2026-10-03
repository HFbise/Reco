"""Pinning messages (see pins.py): who may, and telling everyone in the chat."""

import logging

from flask_socketio import emit

import moderation
import pins
import room_access
from auth_session import authenticated, dm_participants, in_room, readable
from db import get_db
from demo import DEMO_ROOM
from extensions import socketio
from replies import fail
from state import get_level
from utils import int_field, str_field

log = logging.getLogger(__name__)


def may_pin(cur, username: str, room: str) -> bool:
    """A room's owner and admins; both people in a DM. Not in a match or the demo room."""
    if room == DEMO_ROOM or room_access.is_match(room):
        return False
    participants = dm_participants(room)
    if participants is not None:
        return username in participants and not moderation.blocked_either_way(cur, *participants)
    cur.execute('SELECT owner, admins, kicked FROM rooms WHERE name = %s', (room,))
    row = cur.fetchone()
    return bool(row) and username not in (row['kicked'] or []) and get_level(username, row) >= 1


def broadcast(room: str):
    """The chat's pins, to everyone in it."""
    with get_db() as conn:
        listed = pins.listed(conn.cursor(), room)
    socketio.emit('pins_updated', {'room': room, 'pins': listed}, to=room)


@socketio.on('get_pins')
@readable
def handle_get_pins(_username, data):
    room = str_field(data, 'room')
    if not in_room(room):
        return
    with get_db() as conn:
        emit('pins_updated', {'room': room, 'pins': pins.listed(conn.cursor(), room)})


def _pin_or_unpin(username: str, data: dict, pinning: bool):
    msg_id = int_field(data, 'id')
    event = 'pin_result'
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT room, recalled, system FROM messages WHERE id = %s', (msg_id,))
            msg = cur.fetchone()
            if not msg or msg['recalled'] or msg['system'] or not in_room(msg['room']):
                return
            room = msg['room']
            if not may_pin(cur, username, room):
                fail(event, 'no_permission')
                return
            if pinning and not pins.pin(cur, room, msg_id, username):
                fail(event, 'too_many_pins', {'max': pins.MAX_PER_CHAT})
                return
            if not pinning:
                pins.unpin(cur, msg_id)
            conn.commit()
        broadcast(room)
    except Exception as e:
        log.exception('pin error: %s', e)
        fail(event, 'server_error')


@socketio.on('pin_message')
@authenticated
def handle_pin_message(username, data):
    _pin_or_unpin(username, data, True)


@socketio.on('unpin_message')
@authenticated
def handle_unpin_message(username, data):
    _pin_or_unpin(username, data, False)

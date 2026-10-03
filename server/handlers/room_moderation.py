"""What a room's owner and admins do to its members: remove them, make them admins,
mute them, keep them off voice. Each step is checked (moderation.can_moderate: you act
only on people ranked below you) and logged in the room's moderation log."""

import logging

from flask_socketio import emit

import moderation
import room_access
import room_log
from auth_session import authenticated
from db import get_db
from demo import DEMO_ROOM
from extensions import socketio
from replies import fail
from state import LOBBY, emit_system_msg, get_level
from utils import int_field, str_field

log = logging.getLogger(__name__)


def _room_and_target(data) -> tuple[str, str]:
    return str_field(data, 'room'), str_field(data, 'target')


def _announce_roles(room: str):
    """Who owns and who admins the room, to everyone in it: what each may do follows at once."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
        row = cur.fetchone()
        members = room_access.members_view(cur, row) if row else []
    if row:
        socketio.emit('room_roles', {'room': room, 'owner': row['owner'], 'admins': row['admins'] or []}, to=room)
        socketio.emit('members_list', {'room': room, 'members': members}, to=room)


@socketio.on('kick_member')
@authenticated
def handle_kick_member(requester, data):
    """Out of the room, and kept out until an admin lets them back (unkick_member)."""
    room, target = _room_and_target(data)
    try:
        if not moderation.can_moderate(room, requester, target):
            fail('kick_result', 'no_permission')
            return
        moderation.kick(room, target)
        room_log.record(room, requester, 'kick', target)
        emit('kick_result', {'success': True})
    except Exception as e:
        log.exception('kick_member error: %s', e)
        fail('kick_result', 'server_error')


@socketio.on('set_admin')
@authenticated
def handle_set_admin(requester, data):
    """The owner makes a member an admin, or takes it back (`remove`)."""
    room, target = _room_and_target(data)
    remove = bool(data.get('remove'))
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            if not row or get_level(requester, row) < 2 or get_level(target, row) >= 2:
                fail('set_admin_result', 'no_permission')
                return
            if target not in (row['members'] or []):
                fail('set_admin_result', 'user_not_in_room')
                return
            if remove:
                cur.execute('UPDATE rooms SET admins = array_remove(admins, %s) WHERE name = %s', (target, room))
            else:
                cur.execute(
                    'UPDATE rooms SET admins = array_append(admins, %s)'
                    ' WHERE name = %s AND NOT (%s = ANY(COALESCE(admins, ARRAY[]::text[])))',
                    (target, room, target),
                )
            conn.commit()
            screenname = moderation.screenname(cur, target)
        emit('set_admin_result', {'success': True, 'target': target, 'remove': remove})
        room_log.record(room, requester, 'admin_remove' if remove else 'admin_add', target)
        emit_system_msg(room, 'admin_removed' if remove else 'admin_added', name=screenname)
        _announce_roles(room)
    except Exception as e:
        log.exception('set_admin error: %s', e)
        fail('set_admin_result', 'server_error')


@socketio.on('transfer_owner')
@authenticated
def handle_transfer_owner(requester, data):
    """The owner hands the room to one of its members, and stays on as an admin."""
    room, target = _room_and_target(data)
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM rooms WHERE name = %s FOR UPDATE', (room,))
            row = cur.fetchone()
            if not row or room in (LOBBY, DEMO_ROOM) or get_level(requester, row) < 2 or target == requester:
                fail('transfer_owner_result', 'no_permission')
                return
            if target not in (row['members'] or []) or target in (row['kicked'] or []):
                fail('transfer_owner_result', 'user_not_in_room')
                return
            cur.execute(
                'UPDATE rooms SET owner = %s, admins = array_append('
                ' array_remove(array_remove(COALESCE(admins, ARRAY[]::text[]), %s), %s), %s) WHERE name = %s',
                (target, target, requester, requester, room),
            )
            conn.commit()
            screenname = moderation.screenname(cur, target)
        emit('transfer_owner_result', {'success': True, 'target': target})
        room_log.record(room, requester, 'transfer_owner', target)
        emit_system_msg(room, 'owner_transferred', name=screenname)
        _announce_roles(room)
    except Exception as e:
        log.exception('transfer_owner error: %s', e)
        fail('transfer_owner_result', 'server_error')


# Restrictions: a `duration_seconds` of 0 (or none) lasts until lifted


@socketio.on('text_mute')
@authenticated
def handle_text_mute(requester, data):
    room, target = _room_and_target(data)
    if moderation.can_moderate(room, requester, target):
        duration = int_field(data, 'duration_seconds')
        moderation.mute(room, target, duration)
        room_log.record(room, requester, 'mute', target, duration=duration)


@socketio.on('text_unmute')
@authenticated
def handle_text_unmute(requester, data):
    room, target = _room_and_target(data)
    if moderation.can_moderate(room, requester, target):
        moderation.unmute(room, target)
        room_log.record(room, requester, 'unmute', target)


@socketio.on('voice_ban')
@authenticated
def handle_voice_ban(requester, data):
    room, target = _room_and_target(data)
    if moderation.can_moderate(room, requester, target):
        duration = int_field(data, 'duration_seconds')
        moderation.restrict(room, target, moderation.VOICE, duration)
        room_log.record(room, requester, 'voice_ban', target, duration=duration)


@socketio.on('voice_unban')
@authenticated
def handle_voice_unban(requester, data):
    room, target = _room_and_target(data)
    if moderation.can_moderate(room, requester, target):
        moderation.lift(room, target, moderation.VOICE)
        room_log.record(room, requester, 'voice_unban', target)

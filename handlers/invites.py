"""Inviting someone into a room you're in: they get a DM with a card to tap, and a pass
that lets them past the room's password or invite-only setting once (room_access.admit)."""

import json
import logging
from datetime import datetime

from flask_socketio import emit

import moderation
from auth_session import authenticated, in_room
from db import get_db
from extensions import socketio
from replies import fail
from state import online_users
from utils import str_field

log = logging.getLogger(__name__)


@socketio.on('invite_to_room')
@authenticated
def handle_invite_to_room(inviter, data):
    target, room = str_field(data, 'target'), str_field(data, 'room')
    if not target or target == inviter or not in_room(room):
        fail('invite_sent', 'no_permission')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)', ([inviter, target],))
            names = {u['username']: u['screenname'] for u in cur.fetchall()}
            if target not in names:
                fail('invite_sent', 'user_not_found')
                return
            if moderation.blocked_either_way(cur, inviter, target):
                fail('invite_sent', 'cannot_invite')
                return
            cur.execute(
                'INSERT INTO room_invites (room, username, invited_by) VALUES (%s, %s, %s)'
                ' ON CONFLICT (room, username) DO UPDATE SET invited_by = EXCLUDED.invited_by, created_at = NOW()',
                (room, target, inviter),
            )
            cur.execute('SELECT code FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            invite = {'room': room, 'code': row['code'] if row else ''}
            screenname = names.get(inviter, inviter)
            # The card is drawn from meta.invite in the reader's language; the text is only a fallback
            text = f'{screenname} 邀请你加入房间 {room}'
            dm_room = moderation.dm_room_id(inviter, target)
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time, meta)'
                ' VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING id, created_at',
                (dm_room, inviter, screenname, text, datetime.now().strftime('%H:%M'), json.dumps({'invite': invite})),
            )
            saved = cur.fetchone()
            conn.commit()
        message = {
            'id': saved['id'],
            'username': inviter,
            'screenname': screenname,
            'text': text,
            'time': saved['created_at'].isoformat(),
            'room': dm_room,
            'meta': {'invite': invite},
        }
        # Both people's devices: the DM may not be open (or even listed) yet
        for username in (inviter, target):
            for sid in list(online_users.get(username, [])):
                socketio.emit('message', message, to=sid)
        emit('invite_sent', {'success': True})
    except Exception as e:
        log.exception('invite_to_room error: %s', e)
        fail('invite_sent', 'server_error')

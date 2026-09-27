import logging

from flask_socketio import emit, join_room

import history
from auth_session import authenticated, dm_participants, readable
from db import get_db
from extensions import socketio

log = logging.getLogger(__name__)


@socketio.on('get_dms')
@readable
def handle_get_dms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            # Exact match on the two name parts ('_' in LIKE is a wildcard, so a
            # prefix pattern would also match other people's DMs). A closed DM
            # stays hidden until a newer message arrives.
            cur.execute(
                'SELECT d.room, u.username, u.screenname, u.avatar_expression, u.avatar_color FROM ('
                '   SELECT m.room, MAX(m.created_at) AS last_at FROM messages m'
                "   WHERE m.room LIKE 'dm:%%' AND %s IN (split_part(m.room, ':', 2), split_part(m.room, ':', 3))"
                '   GROUP BY m.room'
                ' ) d'
                " JOIN users u ON u.username = CASE WHEN split_part(d.room, ':', 2) = %s"
                "   THEN split_part(d.room, ':', 3) ELSE split_part(d.room, ':', 2) END"
                ' LEFT JOIN dm_closed c ON c.username = %s AND c.dm_room = d.room'
                " WHERE d.last_at > COALESCE(c.closed_at, '-infinity'::timestamptz)"
                ' ORDER BY d.last_at DESC',
                (username, username, username),
            )
            rows = cur.fetchall()
        dms = []
        for r in rows:
            if username not in (dm_participants(r['room']) or ()):
                continue
            join_room(r['room'])
            dms.append(
                {
                    'dm_room': r['room'],
                    'other_username': r['username'],
                    'other_screenname': r['screenname'],
                    'avatar_expression': r.get('avatar_expression') or 'Smile',
                    'avatar_color': r.get('avatar_color') or '#5865F2',
                }
            )
        emit('dms_list', {'dms': dms})
    except Exception as e:
        log.exception('get_dms error: %s', e)
        emit('dms_list', {'dms': []})


@socketio.on('close_dm')
@authenticated
def handle_close_dm(username, data):
    dm_room = data.get('dm_room', '')
    if username not in (dm_participants(dm_room) or ()):
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO dm_closed (username, dm_room, closed_at) VALUES (%s, %s, NOW())'
                ' ON CONFLICT (username, dm_room) DO UPDATE SET closed_at = NOW()',
                (username, dm_room),
            )
            conn.commit()
    except Exception as e:
        log.exception('close_dm error: %s', e)


@socketio.on('join_dm')
@authenticated
def handle_join_dm(username, data):
    dm_room = data.get('dm_room', '')
    if username not in (dm_participants(dm_room) or ()):
        emit('join_dm_result', {'success': False})
        return
    join_room(dm_room)
    has_older = False
    try:
        with get_db() as conn:
            cur = conn.cursor()
            messages, reset = history.recent(cur, dm_room, data.get('since'))
            client_oldest = None if reset else data.get('oldest_id')
            has_older = history.has_older(cur, dm_room, history.oldest_shown(messages, client_oldest))
        if reset:
            emit('history_reset', {'room': dm_room})
        for msg in messages:
            emit('message', msg)
    except Exception as e:
        log.exception('join_dm history error: %s', e)
    emit('join_dm_result', {'success': True, 'dm_room': dm_room, 'has_older': has_older})

import logging

from flask_socketio import emit, join_room

from auth_session import authenticated, dm_participants
from db import get_db
from extensions import socketio

log = logging.getLogger(__name__)


@socketio.on('get_dms')
@authenticated
def handle_get_dms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            # A closed DM stays hidden until a newer message arrives
            cur.execute(
                'SELECT m.room FROM messages m'
                " WHERE m.room LIKE 'dm:%%:%%' AND (m.room LIKE %s OR m.room LIKE %s)"
                ' GROUP BY m.room'
                ' HAVING MAX(m.created_at) > COALESCE('
                '   (SELECT c.closed_at FROM dm_closed c WHERE c.username = %s AND c.dm_room = m.room),'
                "   '-infinity'::timestamptz)",
                (f'dm:{username}:%', f'dm:%:{username}', username),
            )
            dm_rooms = [r['room'] for r in cur.fetchall()]
            dms = []
            for dm_room in dm_rooms:
                parts = dm_room.split(':')
                if len(parts) != 3:
                    continue
                other = parts[2] if parts[1] == username else parts[1]
                cur.execute(
                    'SELECT screenname, avatar_expression, avatar_color FROM users WHERE username = %s', (other,)
                )
                other_user = cur.fetchone()
                if other_user:
                    dms.append(
                        {
                            'dm_room': dm_room,
                            'other_username': other,
                            'other_screenname': other_user['screenname'],
                            'avatar_expression': other_user.get('avatar_expression') or 'Smile',
                            'avatar_color': other_user.get('avatar_color') or '#5865F2',
                        }
                    )
                join_room(dm_room)
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
    try:
        with get_db() as conn:
            cur = conn.cursor()
            since = data.get('since')
            if since:
                cur.execute(
                    'SELECT * FROM messages WHERE room = %s AND created_at > %s ORDER BY created_at ASC LIMIT 50',
                    (dm_room, since),
                )
                history = cur.fetchall()
            else:
                cur.execute('SELECT * FROM messages WHERE room = %s ORDER BY created_at DESC LIMIT 50', (dm_room,))
                history = list(reversed(cur.fetchall()))
        for msg in history:
            emit(
                'message',
                {
                    'id': msg['id'],
                    'username': msg['username'],
                    'screenname': msg['screenname'],
                    'text': msg['text'],
                    'time': msg['created_at'].isoformat() if msg.get('created_at') else msg['time'],
                    'room': dm_room,
                    'recalled': bool(msg.get('recalled')),
                    'edited': bool(msg.get('edited')),
                    'reactions': dict(msg.get('reactions') or {}),
                    'meta': dict(msg['meta']) if msg.get('meta') else None,
                },
            )
    except Exception as e:
        log.exception('join_dm history error: %s', e)
    emit('join_dm_result', {'success': True, 'dm_room': dm_room})

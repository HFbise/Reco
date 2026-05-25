import logging
from flask_socketio import emit, join_room
from extensions import socketio
from db import get_db

log = logging.getLogger(__name__)


@socketio.on('get_dms')
def handle_get_dms(data):
    username = data.get('username', '')
    if not username:
        emit('dms_list', {'dms': []})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT DISTINCT room FROM messages"
                " WHERE room LIKE 'dm:%%:%%' AND (room LIKE %s OR room LIKE %s)",
                (f'dm:{username}:%', f'dm:%:{username}')
            )
            dm_rooms = [r['room'] for r in cur.fetchall()]
            dms = []
            for dm_room in dm_rooms:
                parts = dm_room.split(':')
                if len(parts) != 3:
                    continue
                other = parts[2] if parts[1] == username else parts[1]
                cur.execute(
                    'SELECT screenname, avatar_expression, avatar_color FROM users WHERE username = %s',
                    (other,)
                )
                other_user = cur.fetchone()
                if other_user:
                    dms.append({
                        'dm_room': dm_room,
                        'other_username': other,
                        'other_screenname': other_user['screenname'],
                        'avatar_expression': other_user.get('avatar_expression') or 'Smile',
                        'avatar_color': other_user.get('avatar_color') or '#5865F2',
                    })
                join_room(dm_room)
        emit('dms_list', {'dms': dms})
    except Exception as e:
        log.error('get_dms error: %s', e)
        emit('dms_list', {'dms': []})


@socketio.on('join_dm')
def handle_join_dm(data):
    username = data['username']
    dm_room = data['dm_room']
    parts = dm_room.split(':')
    if len(parts) != 3 or parts[0] != 'dm' or username not in [parts[1], parts[2]]:
        emit('join_dm_result', {'success': False})
        return
    join_room(dm_room)
    try:
        with get_db() as conn:
            cur = conn.cursor()
            since = data.get('since')
            if since:
                cur.execute(
                    'SELECT * FROM messages WHERE room = %s AND created_at > %s'
                    ' ORDER BY created_at ASC LIMIT 50',
                    (dm_room, since)
                )
                history = cur.fetchall()
            else:
                cur.execute(
                    'SELECT * FROM messages WHERE room = %s ORDER BY created_at DESC LIMIT 50',
                    (dm_room,)
                )
                history = list(reversed(cur.fetchall()))
        for msg in history:
            emit('message', {
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
            })
    except Exception as e:
        log.error('join_dm history error: %s', e)
    emit('join_dm_result', {'success': True, 'dm_room': dm_room})

import logging

from flask_socketio import emit, join_room

import chat_prefs
import history
import reads
from auth_session import authenticated, dm_participants, readable
from db import get_db
from extensions import socketio
from state import appears_online
from utils import digest

log = logging.getLogger(__name__)

PREVIEW_LEN = 120  # the list shows one line; no need to send whole messages


def last_message_preview(row) -> dict:
    """The newest message of a DM as the chat list shows it. A recalled message's text is never sent."""
    return {
        'id': row['last_id'],
        'username': row['last_from'],
        'text': '' if row['last_recalled'] else (row['last_text'] or '')[:PREVIEW_LEN],
        'recalled': bool(row['last_recalled']),
        'system': bool(row['last_system']),
        'meta': row['last_meta'] if row['last_system'] else None,
        'image': bool((row['last_meta'] or {}).get('image')) and not row['last_recalled'],
    }


@socketio.on('get_dms')
@readable
def handle_get_dms(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            # Their DMs come from two partial indexes, one per name in 'dm:<a>:<b>' (an exact
            # match: '_' in LIKE is a wildcard, so a prefix pattern would also match other
            # people's DMs); each DM's newest message then from (room, created_at). A closed
            # DM stays hidden until a newer message arrives.
            cur.execute(
                'SELECT d.room, u.username, u.screenname, u.avatar_expression, u.avatar_color,'
                ' last.id AS last_id, last.username AS last_from, last.text AS last_text,'
                ' last.recalled AS last_recalled, last.system AS last_system, last.meta AS last_meta FROM ('
                "   SELECT room FROM messages WHERE room LIKE 'dm:%%' AND split_part(room, ':', 2) = %s"
                "   UNION SELECT room FROM messages WHERE room LIKE 'dm:%%' AND split_part(room, ':', 3) = %s"
                ' ) d'
                " JOIN users u ON u.username = CASE WHEN split_part(d.room, ':', 2) = %s"
                "   THEN split_part(d.room, ':', 3) ELSE split_part(d.room, ':', 2) END"
                ' LEFT JOIN dm_closed c ON c.username = %s AND c.dm_room = d.room'
                # The newest message, for the preview line under the name
                ' CROSS JOIN LATERAL ('
                '   SELECT id, username, text, recalled, system, meta, created_at FROM messages'
                '   WHERE room = d.room ORDER BY created_at DESC, id DESC LIMIT 1'
                ' ) last'
                " WHERE last.created_at > COALESCE(c.closed_at, '-infinity'::timestamptz)"
                ' ORDER BY last.created_at DESC',
                (username, username, username, username),
            )
            rows = cur.fetchall()
            unread = reads.unread_counts(cur, username, [r['room'] for r in rows])
            prefs = chat_prefs.for_user(cur, username, [r['room'] for r in rows])
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
                    'online': appears_online(r['username']),
                    'last': last_message_preview(r),
                    'unread': unread.get(r['room'], 0),
                    **prefs.get(r['room'], chat_prefs.DEFAULT),
                }
            )
        # Who is online changes all the time: it's left out of the fingerprint and always sent, so
        # an unchanged list still has fresh online dots
        online = {d['other_username']: d['online'] for d in dms}
        fingerprint = digest([{k: v for k, v in d.items() if k != 'online'} for d in dms])
        if data.get('digest') == fingerprint:
            emit('dms_list', {'unchanged': True, 'digest': fingerprint, 'online': online})
        else:
            emit('dms_list', {'dms': dms, 'digest': fingerprint})
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
    unread = None
    try:
        with get_db() as conn:
            cur = conn.cursor()
            unread = reads.unread_from(cur, username, dm_room, never_opened=0)  # all of a new DM is new
            messages, reset = history.recent(cur, dm_room, data.get('since'))
            client_oldest = None if reset else data.get('oldest_id')
            has_older = history.has_older(cur, dm_room, history.oldest_shown(messages, client_oldest))
            reads.mark_read(cur, username, dm_room)
            conn.commit()
        if reset:
            emit('history_reset', {'room': dm_room})
        for msg in messages:
            emit('message', msg)
    except Exception as e:
        log.exception('join_dm history error: %s', e)
    emit('join_dm_result', {'success': True, 'dm_room': dm_room, 'has_older': has_older, 'unread': unread})

"""The chat card: one person's settings for a chat (pin, mute, mark as read) and looking back
through it (search, photos). Rooms and DMs alike, for anyone who can see the chat."""

import logging

from flask_socketio import emit

import chat_prefs
import reads
from auth_session import authenticated, in_room, readable
from db import get_db
from extensions import socketio
from replies import fail
from room_access import can_see
from state import online_users
from utils import int_field, str_field

log = logging.getLogger(__name__)

MAX_QUERY_LEN = 100
SEARCH_PAGE = 30
PHOTO_PAGE = 60


def _to_all_devices(username: str, event: str, payload: dict):
    for sid in list(online_users.get(username, [])):
        socketio.emit(event, payload, to=sid)


@socketio.on('get_chat_pref')
@authenticated
def handle_get_chat_pref(username, data):
    room = str_field(data, 'room')
    with get_db() as conn:
        cur = conn.cursor()
        if not can_see(cur, username, room):
            return
        prefs = chat_prefs.for_user(cur, username, [room]).get(room, chat_prefs.DEFAULT)
    emit('chat_pref', {'room': room, **prefs})


@socketio.on('set_chat_pref')
@authenticated
def handle_set_chat_pref(username, data):
    """Pin a chat to the top of the list and/or mute its notifications; every device follows."""
    room = str_field(data, 'room')
    pinned, muted = (data.get(k) if isinstance(data.get(k), bool) else None for k in ('pinned', 'muted'))
    if pinned is None and muted is None:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if not can_see(cur, username, room):
                fail('chat_pref_result', 'no_permission')
                return
            prefs = chat_prefs.update(cur, username, room, pinned, muted)
            conn.commit()
        _to_all_devices(username, 'chat_pref', {'room': room, **prefs})
    except Exception as e:
        log.exception('set_chat_pref error: %s', e)
        fail('chat_pref_result', 'server_error')


@socketio.on('mark_chat_read')
@authenticated
def handle_mark_chat_read(username, data):
    """Everything in the chat counts as read, without opening it."""
    room = str_field(data, 'room')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if not can_see(cur, username, room):
                return
            reads.mark_read(cur, username, room)
            conn.commit()
        _to_all_devices(username, 'chat_read', {'room': room})
    except Exception as e:
        log.exception('mark_chat_read error: %s', e)


@socketio.on('search_messages')
@readable
def handle_search_messages(username, data):
    """Messages in an open chat containing `q` (case-insensitive), newest first, a page at a time."""
    room = str_field(data, 'room')
    query = str_field(data, 'q').strip()[:MAX_QUERY_LEN]
    before = int_field(data, 'before_id')
    reply = {'room': room, 'q': query, 'results': [], 'has_more': False}
    if not query or not in_room(room):
        emit('search_results', reply)
        return
    # The query is text to find, not a pattern: escape LIKE's wildcards
    pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT id, username, screenname, text, created_at FROM messages'
                ' WHERE room = %s AND recalled IS NOT TRUE AND system IS NOT TRUE AND text ILIKE %s'
                ' AND (%s = 0 OR id < %s) ORDER BY id DESC LIMIT %s',
                (room, pattern, before, before, SEARCH_PAGE + 1),
            )
            rows = cur.fetchall()
        reply['has_more'] = len(rows) > SEARCH_PAGE
        reply['results'] = [
            {
                'id': r['id'],
                'username': r['username'],
                'screenname': r['screenname'] or r['username'],
                'text': r['text'],
                'time': r['created_at'].isoformat(),
            }
            for r in rows[:SEARCH_PAGE]
        ]
        emit('search_results', reply)
    except Exception as e:
        log.exception('search_messages error: %s', e)
        emit('search_results', reply)


@socketio.on('get_chat_photos')
@readable
def handle_get_chat_photos(username, data):
    """Every photo still up in an open chat (recalled ones are gone), newest first."""
    room = str_field(data, 'room')
    before = int_field(data, 'before_id')
    reply = {'room': room, 'photos': [], 'has_more': False}
    if not in_room(room):
        emit('chat_photos', reply)
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT m.id AS message_id, m.username, m.screenname, m.created_at, i.id, i.width, i.height'
                ' FROM messages m JOIN images i ON i.message_id = m.id'
                ' WHERE m.room = %s AND m.recalled IS NOT TRUE AND (%s = 0 OR m.id < %s)'
                ' ORDER BY m.id DESC LIMIT %s',
                (room, before, before, PHOTO_PAGE + 1),
            )
            rows = cur.fetchall()
        reply['has_more'] = len(rows) > PHOTO_PAGE
        reply['photos'] = [
            {
                'message_id': r['message_id'],
                'image': {'id': r['id'], 'w': r['width'], 'h': r['height']},
                'username': r['username'],
                'screenname': r['screenname'] or r['username'],
                'time': r['created_at'].isoformat(),
            }
            for r in rows[:PHOTO_PAGE]
        ]
        emit('chat_photos', reply)
    except Exception as e:
        log.exception('get_chat_photos error: %s', e)
        emit('chat_photos', reply)

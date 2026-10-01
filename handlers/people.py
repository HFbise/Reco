"""Reporting and blocking people (anywhere, not just in a room). A block hides their
messages from you, stops DMs and invites both ways, and keeps you from being matched."""

import logging

from flask_socketio import emit

from auth_session import authenticated, readable
from db import get_db
from extensions import socketio
from utils import str_field

log = logging.getLogger(__name__)

MAX_REPORT_LEN = 500


@socketio.on('report_user')
@authenticated
def handle_report_user(reporter, data):
    """Filed for the site's moderators (the /admin panel)."""
    reported = str_field(data, 'reported')
    reason = str_field(data, 'reason').strip()[:MAX_REPORT_LEN]
    if not reported or reporter == reported:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO reports (reporter, reported, reason) VALUES (%s, %s, %s)', (reporter, reported, reason)
            )
            conn.commit()
        emit('report_result', {'success': True})
    except Exception as e:
        log.exception('report_user error: %s', e)
        emit('report_result', {'success': False})


@socketio.on('block_user')
@authenticated
def handle_block_user(blocker, data):
    blocked = str_field(data, 'blocked')
    if not blocked or blocker == blocked:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO blocks (blocker, blocked) VALUES (%s, %s) ON CONFLICT DO NOTHING', (blocker, blocked)
            )
            conn.commit()
        emit('block_result', {'success': True, 'blocked': blocked})
    except Exception as e:
        log.exception('block_user error: %s', e)
        emit('block_result', {'success': False})


@socketio.on('unblock_user')
@authenticated
def handle_unblock_user(blocker, data):
    blocked = str_field(data, 'blocked')
    if not blocked:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('DELETE FROM blocks WHERE blocker = %s AND blocked = %s', (blocker, blocked))
            conn.commit()
        emit('unblock_result', {'success': True, 'unblocked': blocked})
    except Exception as e:
        log.exception('unblock_user error: %s', e)
        emit('unblock_result', {'success': False})


@socketio.on('get_blocked_users')
@readable
def handle_get_blocked_users(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT b.blocked AS username, u.screenname, u.avatar_expression, u.avatar_color'
                ' FROM blocks b LEFT JOIN users u ON u.username = b.blocked WHERE b.blocker = %s'
                ' ORDER BY lower(COALESCE(u.screenname, b.blocked))',
                (username,),
            )
            rows = cur.fetchall()
        people = [{**r, 'screenname': r['screenname'] or r['username']} for r in rows]
        # `users` (names only) is what the chat list needs; settings shows `people`
        emit('blocked_users_list', {'users': [p['username'] for p in people], 'people': people})
    except Exception as e:
        log.exception('get_blocked_users error: %s', e)
        emit('blocked_users_list', {'users': [], 'people': []})

import logging
from flask_socketio import emit
from extensions import socketio
from db import get_db
from state import is_site_admin

log = logging.getLogger(__name__)


@socketio.on('submit_feedback')
def handle_submit_feedback(data):
    username = data.get('username', '').strip()
    text = data.get('text', '').strip()
    if not username or not text:
        emit('feedback_result', {'success': False, 'msg': '内容不能为空'})
        return
    if len(text) > 2000:
        emit('feedback_result', {'success': False, 'msg': '反馈不能超过2000字'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO feedback (username, text) VALUES (%s, %s)',
                (username, text)
            )
            conn.commit()
        emit('feedback_result', {'success': True})
    except Exception as e:
        log.error('submit_feedback error: %s', e)
        emit('feedback_result', {'success': False, 'msg': str(e)})


@socketio.on('get_feedback')
def handle_get_feedback(data):
    if not is_site_admin(data.get('username', '')):
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT id, username, text, created_at FROM feedback'
                ' ORDER BY created_at DESC LIMIT 200'
            )
            rows = cur.fetchall()
        emit('feedback_list', {'items': [dict(r) for r in rows]})
    except Exception as e:
        log.error('get_feedback error: %s', e)
        emit('feedback_list', {'items': []})

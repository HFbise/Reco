import logging
from flask_socketio import emit
from extensions import socketio
from db import get_db
from auth_session import authenticated

log = logging.getLogger(__name__)


@socketio.on('submit_feedback')
@authenticated
def handle_submit_feedback(username, data):
    text = data.get('text', '').strip()
    if not text:
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

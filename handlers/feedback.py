import logging
from flask_socketio import emit
from extensions import socketio
from db import get_db
from replies import fail
from auth_session import authenticated

log = logging.getLogger(__name__)


@socketio.on('submit_feedback')
@authenticated
def handle_submit_feedback(username, data):
    text = data.get('text', '').strip()
    if not text:
        fail('feedback_result', 'feedback_empty')
        return
    if len(text) > 2000:
        fail('feedback_result', 'feedback_too_long', {'max': 2000})
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
        log.exception('submit_feedback error: %s', e)
        fail('feedback_result', 'server_error')

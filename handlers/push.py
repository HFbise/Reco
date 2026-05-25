import json
import logging
import threading
import urllib.request as _req
from flask_socketio import emit
from extensions import socketio
from state import push_tokens

log = logging.getLogger(__name__)


@socketio.on('register_push_token')
def handle_register_push_token(data):
    username = data.get('username', '')
    token = data.get('token', '')
    if not username or not token:
        return
    tokens = push_tokens.setdefault(username, [])
    if token not in tokens:
        tokens.append(token)


def send_push(tokens: list, title: str, body: str, data: dict = None):
    """Fire-and-forget Expo push notification."""
    if not tokens:
        return

    def _worker():
        try:
            payload = json.dumps([
                {'to': t, 'title': title, 'body': body,
                 'data': data or {}, 'sound': 'default'}
                for t in tokens
            ]).encode('utf-8')
            req = _req.Request(
                'https://exp.host/--/api/v2/push/send',
                data=payload,
                headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
                method='POST',
            )
            _req.urlopen(req, timeout=5)
        except Exception as e:
            log.error('push error: %s', e)

    threading.Thread(target=_worker, daemon=True).start()

import json
import logging
import threading
import urllib.request as _req

from auth_session import authenticated
from db import get_db
from extensions import socketio

log = logging.getLogger(__name__)


@socketio.on('register_push_token')
@authenticated
def handle_register_push_token(username, data):
    token = (data.get('token') or '').strip()
    if not token.startswith('ExponentPushToken['):
        return
    # A device token belongs to whoever is signed in on that device right now
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO push_tokens (token, username, platform, updated_at) VALUES (%s, %s, %s, NOW())'
            ' ON CONFLICT (token) DO UPDATE SET username = EXCLUDED.username,'
            ' platform = EXCLUDED.platform, updated_at = NOW()',
            (token, username, (data.get('platform') or '')[:16]),
        )
        conn.commit()


@socketio.on('unregister_push_token')
@authenticated
def handle_unregister_push_token(username, data):
    """Called on logout so the device stops receiving this account's notifications."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM push_tokens WHERE token = %s AND username = %s', ((data.get('token') or ''), username))
        conn.commit()


def tokens_for(usernames) -> list:
    usernames = list(usernames)
    if not usernames:
        return []
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT token FROM push_tokens WHERE username = ANY(%s)', (usernames,))
        return [r['token'] for r in cur.fetchall()]


def send_push(tokens: list, title: str, body: str, data: dict = None):
    """Fire-and-forget Expo push notification."""
    if not tokens:
        return

    def _worker():
        try:
            payload = json.dumps(
                [{'to': t, 'title': title, 'body': body, 'data': data or {}, 'sound': 'default'} for t in tokens]
            ).encode('utf-8')
            req = _req.Request(
                'https://exp.host/--/api/v2/push/send',
                data=payload,
                headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
                method='POST',
            )
            _req.urlopen(req, timeout=5)
        except Exception as e:
            log.exception('push error: %s', e)

    threading.Thread(target=_worker, daemon=True).start()

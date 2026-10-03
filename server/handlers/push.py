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


EXPO_BATCH = 100  # Expo's limit per request: a bigger batch fails as a whole


def _forget_tokens(tokens: list):
    """Devices Expo says are gone (the app was uninstalled or its push permission revoked)."""
    if not tokens:
        return
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM push_tokens WHERE token = ANY(%s)', (tokens,))
        conn.commit()


def _post_batch(batch: list, title: str, body: str, data: dict | None) -> list:
    """Send one batch; returns the tokens Expo reported as no longer registered."""
    payload = json.dumps(
        [{'to': t, 'title': title, 'body': body, 'data': data or {}, 'sound': 'default'} for t in batch]
    ).encode('utf-8')
    req = _req.Request(
        'https://exp.host/--/api/v2/push/send',
        data=payload,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    with _req.urlopen(req, timeout=5) as response:
        tickets = json.loads(response.read() or b'{}').get('data') or []
    # One ticket per message, in the order sent
    return [
        token
        for token, ticket in zip(batch, tickets, strict=False)
        if isinstance(ticket, dict) and (ticket.get('details') or {}).get('error') == 'DeviceNotRegistered'
    ]


def send_push(tokens: list, title: str, body: str, data: dict = None):
    """Fire-and-forget Expo push notification, in batches Expo accepts."""
    if not tokens:
        return

    def _worker():
        gone = []
        for start in range(0, len(tokens), EXPO_BATCH):
            try:
                gone += _post_batch(tokens[start : start + EXPO_BATCH], title, body, data)
            except Exception as e:
                log.exception('push error: %s', e)
        try:
            _forget_tokens(gone)
        except Exception as e:
            log.exception('push token cleanup error: %s', e)

    threading.Thread(target=_worker, daemon=True).start()

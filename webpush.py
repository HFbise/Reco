"""Web push: browser notifications while Reco isn't on screen.

A browser that turns notifications on gives us a push subscription (an endpoint at
its vendor's push service plus encryption keys). To notify someone we encrypt the
payload for each of their subscriptions and POST it to the endpoint, signed with our
VAPID key; the browser's service worker (app/public/push-sw.js) shows it.

Only endpoints at the known push services are accepted: the server makes requests to
whatever URL is stored here, so a free-form URL would let anyone aim it at internal
addresses (SSRF).

Push is off unless VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set.
"""

import json
import logging
import os
import threading
import urllib.parse

from flask import Blueprint, jsonify, request
from pywebpush import WebPushException, webpush

from auth_session import is_guest, verify_token
from db import get_db

log = logging.getLogger(__name__)

bp = Blueprint('webpush', __name__)

# Chrome / Edge (FCM), Chromium builds (Google's jmt17), Firefox (Mozilla autopush), Safari (Apple),
# legacy Edge (WNS). A host matches exactly or as a subdomain.
PUSH_SERVICES = (
    'fcm.googleapis.com',
    'jmt17.google.com',
    'push.services.mozilla.com',
    'push.apple.com',
    'notify.windows.com',
)
MAX_PER_USER = 10  # browsers / devices; the oldest goes first
TTL = 60 * 60  # a notification nobody could deliver within an hour is stale
BACKGROUND = True  # tests deliver inline

CREATE = """CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    endpoint TEXT PRIMARY KEY, username TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())"""


def migrate(cur):
    cur.execute(CREATE)
    cur.execute('CREATE INDEX IF NOT EXISTS web_push_user_idx ON web_push_subscriptions(username)')


def public_key() -> str:
    return os.environ.get('VAPID_PUBLIC_KEY', '') if os.environ.get('VAPID_PRIVATE_KEY') else ''


def _subject() -> str:
    # Push services want a way to reach whoever sends: a mailto: or the site's URL
    return (
        os.environ.get('VAPID_SUBJECT')
        or os.environ.get('PUBLIC_URL')
        or os.environ.get('RENDER_EXTERNAL_URL')
        or 'mailto:noreply@example.com'
    )


def valid_endpoint(endpoint) -> bool:
    if not isinstance(endpoint, str) or len(endpoint) > 1000:
        return False
    url = urllib.parse.urlsplit(endpoint)
    host = (url.hostname or '').lower()
    return url.scheme == 'https' and any(host == s or host.endswith('.' + s) for s in PUSH_SERVICES)


def _user():
    auth = request.headers.get('Authorization', '')
    username = verify_token(auth[7:] if auth.startswith('Bearer ') else '')
    return None if not username or is_guest(username) else username


@bp.route('/api/push/config')
def config():
    return jsonify(key=public_key() or None)


@bp.route('/api/push/subscribe', methods=['POST'])
def subscribe():
    username = _user()
    if not username:
        return jsonify(error='auth_required'), 401
    if not public_key():
        return jsonify(error='push_unavailable'), 404
    data = request.get_json(silent=True) or {}
    keys = data.get('keys') if isinstance(data.get('keys'), dict) else {}
    endpoint, p256dh, auth = data.get('endpoint'), keys.get('p256dh'), keys.get('auth')
    if not valid_endpoint(endpoint) or not all(isinstance(k, str) and 0 < len(k) < 200 for k in (p256dh, auth)):
        return jsonify(error='bad_subscription'), 400
    with get_db() as conn:
        cur = conn.cursor()
        # A browser belongs to whoever signed in on it last
        cur.execute(
            'INSERT INTO web_push_subscriptions (endpoint, username, p256dh, auth) VALUES (%s, %s, %s, %s)'
            ' ON CONFLICT (endpoint) DO UPDATE SET username = EXCLUDED.username, p256dh = EXCLUDED.p256dh,'
            ' auth = EXCLUDED.auth, created_at = NOW()',
            (endpoint, username, p256dh, auth),
        )
        cur.execute(
            'DELETE FROM web_push_subscriptions WHERE endpoint IN (SELECT endpoint FROM web_push_subscriptions'
            ' WHERE username = %s ORDER BY created_at DESC OFFSET %s)',
            (username, MAX_PER_USER),
        )
        conn.commit()
    return '', 204


@bp.route('/api/push/unsubscribe', methods=['POST'])
def unsubscribe():
    """Notifications turned off, or signing out of this browser."""
    username = _user()
    if not username:
        return jsonify(error='auth_required'), 401
    endpoint = (request.get_json(silent=True) or {}).get('endpoint')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM web_push_subscriptions WHERE endpoint = %s AND username = %s', (endpoint, username))
        conn.commit()
    return '', 204


def _deliver(rows, payload: str):
    gone = []
    for row in rows:
        try:
            webpush(
                {'endpoint': row['endpoint'], 'keys': {'p256dh': row['p256dh'], 'auth': row['auth']}},
                payload,
                vapid_private_key=os.environ['VAPID_PRIVATE_KEY'],
                vapid_claims={'sub': _subject()},
                ttl=TTL,
                timeout=10,
            )
        except WebPushException as e:
            status = getattr(e.response, 'status_code', None)
            if status in (404, 410):
                gone.append(row['endpoint'])  # unsubscribed or expired on the browser's side
            else:
                log.warning('web push failed (%s): %s', status, e)
        except Exception as e:
            log.warning('web push failed: %s', e)
    if gone:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('DELETE FROM web_push_subscriptions WHERE endpoint = ANY(%s)', (gone,))
            conn.commit()


def notify(usernames, title: str, body: str, url: str, tag: str, code: str = '', title_code: str = '', params=None):
    """Show a notification on every browser these users turned notifications on in. `code` and
    `title_code` name fixed texts (filled in with `params`) that the service worker translates in
    place of the body and title: the server doesn't know the reader's language."""
    usernames = list(usernames)
    if not usernames or not public_key():
        return
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT endpoint, p256dh, auth FROM web_push_subscriptions WHERE username = ANY(%s)', (usernames,))
        rows = cur.fetchall()
    if not rows:
        return
    payload = json.dumps(
        {
            'title': title,
            'body': body,
            'url': url,
            'tag': tag,
            'code': code,
            'title_code': title_code,
            'params': params or {},
        }
    )
    if BACKGROUND:
        threading.Thread(target=_deliver, args=(rows, payload), daemon=True).start()
    else:
        _deliver(rows, payload)

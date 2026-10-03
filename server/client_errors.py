"""Browser errors, reported through the backend's Sentry.

The web app posts uncaught errors here instead of bundling a Sentry SDK of its own: no extra
kilobytes for every visitor, no second DSN in the page, and one place to look. Each report
becomes a Sentry event tagged `side: web` (with the page and user agent), or a log line when
Sentry isn't configured.
"""

import logging
import time

import sentry_sdk
from flask import Blueprint, jsonify, request

import monitoring
from auth_session import verify_token

log = logging.getLogger(__name__)
bp = Blueprint('client_errors', __name__)

MAX_FIELD = 4000
PER_MINUTE = 20  # per client address: a crash loop must not flood Sentry
_recent: dict[str, list[float]] = {}


def _field(data: dict, key: str, limit: int = MAX_FIELD) -> str:
    value = data.get(key)
    return value[:limit] if isinstance(value, str) else ''


def _rate_ok(key: str) -> bool:
    now = time.monotonic()
    recent = [t for t in _recent.get(key, []) if now - t < 60]
    ok = len(recent) < PER_MINUTE
    _recent[key] = [*recent, now] if ok else recent
    return ok


@bp.route('/api/client-errors', methods=['POST'])
def report():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not _field(data, 'message'):
        return jsonify({'error': 'bad_report'}), 400
    # Render's proxy puts the visitor first in X-Forwarded-For
    who = (request.headers.get('X-Forwarded-For') or request.remote_addr or '?').split(',')[0].strip()
    if not _rate_ok(who):
        return jsonify({'error': 'rate_limited'}), 429

    message = _field(data, 'message', 500)
    stack = _field(data, 'stack')
    page = _field(data, 'url', 500)
    kind = _field(data, 'kind', 40) or 'error'
    auth = request.headers.get('Authorization', '')
    username = verify_token(auth[7:]) if auth.startswith('Bearer ') else None

    if monitoring.enabled:
        with sentry_sdk.new_scope() as scope:
            scope.set_tag('side', 'web')
            scope.set_tag('kind', kind)
            if username:
                scope.set_user({'username': username})
            scope.set_context('browser', {'url': page, 'user_agent': _field(data, 'ua', 400), 'stack': stack})
            sentry_sdk.capture_message(f'[web] {message}', level='error')
    else:
        log.warning('web error (%s) on %s: %s\n%s', kind, page, message, stack)
    return '', 204

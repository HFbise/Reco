"""Sign in with GitHub or Google (OAuth 2.0 authorization-code flow).

The browser leaves for the provider from GET /auth/<provider> and comes back to
/auth/<provider>/callback. A signed, HttpOnly cookie carries a random `state`
across the round trip, so a callback we didn't start is refused. The provider's
access token is used once, to read the account's stable id, and then dropped:
we keep only (provider, id) -> username, and ask for no email or other scopes.

The callback hands the web app a short-lived ticket in the URL fragment (never
sent to servers or in Referer headers); the app trades it over the socket for a
normal session token (handlers/oauth.py):
  #login=<ticket>   the identity is linked to an account: sign in (one use, 2 min)
  #signup=<ticket>  a new identity: the user picks a username first (15 min)
  #linked=<name>    a signed-in user connected this provider from their profile
  #error=<code>     cancelled, expired, already linked elsewhere... (translated like any srv- code)

Accounts are never matched up by email: linking an existing account to a
provider only happens from inside that account.
"""

import json
import logging
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

from flask import Blueprint, jsonify, redirect, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from auth_session import is_guest, password_fingerprint, verify_token
from db import get_db
from extensions import app
from moderation import username_available

log = logging.getLogger(__name__)

bp = Blueprint('oauth', __name__)

PROVIDERS = {
    'github': {
        'authorize': 'https://github.com/login/oauth/authorize',
        'token': 'https://github.com/login/oauth/access_token',
        'user': 'https://api.github.com/user',
        'scope': '',  # the public profile needs no scope
    },
    'google': {
        'authorize': 'https://accounts.google.com/o/oauth2/v2/auth',
        'token': 'https://oauth2.googleapis.com/token',
        'user': 'https://openidconnect.googleapis.com/v1/userinfo',
        'scope': 'openid profile',
    },
}

STATE_COOKIE = 'reco_oauth'
STATE_MAX_AGE = 10 * 60
LOGIN_TICKET_MAX_AGE = 2 * 60
SIGNUP_TICKET_MAX_AGE = 15 * 60
HTTP_TIMEOUT = 10

_signer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='oauth')
# Login tickets are single-use; one worker, so memory is enough (see gunicorn.conf.py)
_used_nonces: dict[str, float] = {}

CREATE = """CREATE TABLE IF NOT EXISTS oauth_accounts (
    provider TEXT NOT NULL, provider_id TEXT NOT NULL, username TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (provider, provider_id))"""


def migrate(cur):
    cur.execute(CREATE)
    # One GitHub and one Google per account
    cur.execute('CREATE UNIQUE INDEX IF NOT EXISTS oauth_accounts_user_idx ON oauth_accounts(username, provider)')
    # Accounts made through a provider start without a password of their own
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS has_password BOOLEAN NOT NULL DEFAULT TRUE')


def _credentials(provider: str):
    key = provider.upper()
    client_id, secret = os.environ.get(f'{key}_CLIENT_ID'), os.environ.get(f'{key}_CLIENT_SECRET')
    return (client_id, secret) if client_id and secret else None


def configured() -> list[str]:
    """Providers with credentials set; the others are hidden from the app."""
    return [p for p in PROVIDERS if _credentials(p)]


def _public_url() -> str:
    # Render terminates TLS in front of the app, so request.url_root would say http://
    base = os.environ.get('PUBLIC_URL') or os.environ.get('RENDER_EXTERNAL_URL') or request.url_root
    return base.rstrip('/')


def _app_url() -> str:
    # Where the web app lives: the same server in production, Expo's dev server locally
    return (os.environ.get('APP_URL') or _public_url()).rstrip('/')


def _redirect_uri(provider: str) -> str:
    return f'{_public_url()}/auth/{provider}/callback'


def _back_to_app(**fragment):
    response = redirect(f'{_app_url()}/oauth#{urllib.parse.urlencode(fragment)}')
    response.delete_cookie(STATE_COOKIE, path='/auth')
    return response


def _start(provider: str, link_user: str | None = None):
    """The provider's consent URL, plus the cookie value that proves we sent the user there."""
    state = secrets.token_urlsafe(24)
    client_id, _ = _credentials(provider)
    params = {
        'client_id': client_id,
        'redirect_uri': _redirect_uri(provider),
        'state': state,
        'response_type': 'code',
    }
    if PROVIDERS[provider]['scope']:
        params['scope'] = PROVIDERS[provider]['scope']
    if provider == 'google':
        params['prompt'] = 'select_account'
    cookie = _signer.dumps({'s': state, 'pv': provider, 'link': link_user}, salt='oauth-state')
    return f'{PROVIDERS[provider]["authorize"]}?{urllib.parse.urlencode(params)}', cookie


def _with_state_cookie(response, cookie: str):
    response.set_cookie(
        STATE_COOKIE,
        cookie,
        max_age=STATE_MAX_AGE,
        path='/auth',
        httponly=True,
        secure=_public_url().startswith('https://'),
        samesite='Lax',  # sent on the provider's top-level redirect back to us
    )
    return response


# ── talking to the provider ───────────────────────────────────


def _http_json(url: str, data: dict | None = None, token: str | None = None) -> dict:
    headers = {'Accept': 'application/json', 'User-Agent': 'Reco'}  # GitHub rejects requests without one
    if token:
        headers['Authorization'] = f'Bearer {token}'
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return json.loads(resp.read().decode())


def fetch_identity(provider: str, code: str) -> dict:
    """Trade the callback's code for the account's id and a name to suggest. Raises on failure."""
    client_id, secret = _credentials(provider)
    spec = PROVIDERS[provider]
    tokens = _http_json(
        spec['token'],
        {
            'client_id': client_id,
            'client_secret': secret,
            'code': code,
            'redirect_uri': _redirect_uri(provider),
            'grant_type': 'authorization_code',
        },
    )
    access = tokens.get('access_token')
    if not access:
        raise ValueError(f'no access token from {provider}: {tokens.get("error")}')
    profile = _http_json(spec['user'], token=access)
    if provider == 'github':
        uid, handle, name = profile.get('id'), profile.get('login') or '', profile.get('name') or ''
    else:
        uid, handle, name = profile.get('sub'), profile.get('given_name') or '', profile.get('name') or ''
    if not uid:
        raise ValueError(f'no account id from {provider}')
    return {'id': str(uid), 'handle': handle, 'name': name or handle}


def suggest_username(cur, handle: str) -> str:
    """A free username close to the provider's handle ('Ada-Lovelace' -> 'ada_lovelace')."""
    base = re.sub(r'[^a-z0-9_]', '', handle.lower().replace('-', '_').replace(' ', '_'))[:20]
    if len(base) < 3:
        base = (base + 'user')[:20]
    if username_available(cur, base):
        return base
    for _ in range(20):
        candidate = f'{base[:16]}{secrets.randbelow(10_000)}'
        if username_available(cur, candidate):
            return candidate
    return ''


# ── tickets the web app trades for a session ──────────────────


def login_ticket(username: str, password_hash: str) -> str:
    return _signer.dumps(
        {'u': username, 'p': password_fingerprint(password_hash), 'n': secrets.token_hex(8)}, salt='oauth-login'
    )


def redeem_login_ticket(ticket: str):
    """The username a login ticket was issued for, once; None if expired, reused or stale."""
    try:
        payload = _signer.loads(ticket, salt='oauth-login', max_age=LOGIN_TICKET_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    now = time.time()
    for nonce, expires in list(_used_nonces.items()):
        if expires < now:
            del _used_nonces[nonce]
    if payload.get('n') in _used_nonces:
        return None
    _used_nonces[payload.get('n')] = now + LOGIN_TICKET_MAX_AGE
    return payload


def signup_ticket(provider: str, provider_id: str) -> str:
    return _signer.dumps({'pv': provider, 'id': provider_id}, salt='oauth-signup')


def read_signup_ticket(ticket: str):
    try:
        return _signer.loads(ticket, salt='oauth-signup', max_age=SIGNUP_TICKET_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


# ── routes ────────────────────────────────────────────────────


@bp.route('/api/auth/providers')
def providers():
    return jsonify(providers=configured())


@bp.route('/auth/<provider>')
def start(provider):
    if provider not in configured():
        return _back_to_app(error='oauth_unavailable')
    url, cookie = _start(provider)
    return _with_state_cookie(redirect(url), cookie)


@bp.route('/api/auth/<provider>/link', methods=['POST'])
def start_link(provider):
    """Connect a provider to the signed-in account. Called with the session token
    (not by navigating), so the account never appears in a URL."""
    auth = request.headers.get('Authorization', '')
    username = verify_token(auth[7:] if auth.startswith('Bearer ') else '')
    if not username or is_guest(username):
        return jsonify(error='auth_required'), 401
    if provider not in configured():
        return jsonify(error='oauth_unavailable'), 404
    url, cookie = _start(provider, link_user=username)
    return _with_state_cookie(jsonify(url=url), cookie)


@bp.route('/auth/<provider>/callback')
def callback(provider):
    try:
        started = _signer.loads(request.cookies.get(STATE_COOKIE, ''), salt='oauth-state', max_age=STATE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return _back_to_app(error='oauth_expired')
    if started.get('pv') != provider or not secrets.compare_digest(started.get('s', ''), request.args.get('state', '')):
        return _back_to_app(error='oauth_expired')
    if request.args.get('error') or not request.args.get('code'):
        return _back_to_app(error='oauth_cancelled')
    if provider not in configured():
        return _back_to_app(error='oauth_unavailable')
    try:
        identity = fetch_identity(provider, request.args['code'])
    except (urllib.error.URLError, ValueError, TimeoutError) as e:
        log.warning('%s sign-in failed: %s', provider, e)
        return _back_to_app(error='oauth_failed')

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT o.username, u.password FROM oauth_accounts o JOIN users u ON u.username = o.username'
            ' WHERE o.provider = %s AND o.provider_id = %s',
            (provider, identity['id']),
        )
        owner = cur.fetchone()
        link_user = started.get('link')
        if link_user:
            if owner:
                return _back_to_app(error='oauth_same_account' if owner['username'] == link_user else 'already_linked')
            cur.execute('SELECT 1 FROM users WHERE username = %s', (link_user,))
            if not cur.fetchone():
                return _back_to_app(error='oauth_expired')
            cur.execute(
                'INSERT INTO oauth_accounts (provider, provider_id, username) VALUES (%s, %s, %s)'
                ' ON CONFLICT DO NOTHING RETURNING provider',
                (provider, identity['id'], link_user),
            )
            linked = cur.fetchone()
            conn.commit()
            return _back_to_app(linked=provider) if linked else _back_to_app(error='already_linked')
        if owner:
            return _back_to_app(login=login_ticket(owner['username'], owner['password']))
        suggestion = suggest_username(cur, identity['handle'] or identity['name'])
    return _back_to_app(
        signup=signup_ticket(provider, identity['id']),
        provider=provider,
        username=suggestion,
        screenname=identity['name'][:32],
    )

"""Integration-test harness: real Postgres, real Socket.IO handlers.

Uses TEST_DATABASE_URL when set (CI uses a Postgres service container);
otherwise starts a throwaway embedded Postgres via `pgserver`.
"""

import functools
import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, 'server')
sys.path.insert(0, SERVER)  # the backend (pyproject's pytest pythonpath does too; scripts need it)

_pg = None
if not os.environ.get('TEST_DATABASE_URL'):
    import pgserver

    _pg = pgserver.get_server(tempfile.mkdtemp(prefix='reco-test-pg-'), cleanup_mode='delete')
    os.environ['TEST_DATABASE_URL'] = _pg.get_uri()

# db.py opens its pool at import time, so configure the environment first
os.environ['DATABASE_URL'] = os.environ['TEST_DATABASE_URL']
os.environ.setdefault('SECRET_KEY', 'test-secret')
os.environ.setdefault('ADMIN_PASSWORD', 'test-admin')
os.environ.setdefault('TURN_SECRET', 'test-turn')
os.environ.setdefault('TURN_HOST', 'turn.test')
# app.py loads the developer's .env, which must not switch real services on in tests (Sentry
# would receive every deliberate test error). dotenv never overrides a variable already set.
for _name in (
    'SENTRY_DSN',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
):
    os.environ[_name] = ''
os.environ['PUBLIC_URL'] = os.environ['APP_URL'] = ''

import app as app_module  # noqa: E402  (registers every socket handler)
import auth_session  # noqa: E402
import handlers.match as match_handlers  # noqa: E402
import state  # noqa: E402
import utils  # noqa: E402
from db import get_db  # noqa: E402
from extensions import app, socketio  # noqa: E402
from matching import MatchQueue  # noqa: E402
from utils import hash_password  # noqa: E402

# Same algorithm as production (scrypt), far lower cost: hashing dominates test time otherwise
utils.generate_password_hash = functools.partial(utils.generate_password_hash, method='scrypt:1024:8:1')

app_module._migrate()

# No background matching sweeps in tests: pairing happens on enqueue, which is what they check
# (the sweep's rules are unit-tested in test_matching_queue.py). A sweep thread outliving one
# test could otherwise write a stale match into the next test's state.
match_handlers._loop_started = True

TABLES = [
    'messages',
    'rooms',
    'users',
    'blocks',
    'reports',
    'feedback',
    'dm_closed',
    'deleted_usernames',
    'push_tokens',
    'room_restrictions',
    'room_invites',
    'matches',
    'read_marks',
    'images',
    'oauth_accounts',
    'web_push_subscriptions',
    'chat_prefs',
    'room_log',
    'user_nicknames',
    'turn_sessions',
    'turn_daily',
]


@pytest.fixture(autouse=True)
def clean_state():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f'TRUNCATE {", ".join(TABLES)} RESTART IDENTITY')
        cur.execute("INSERT INTO rooms (name, admins, members, owner) VALUES ('大厅', '{}', '{}', NULL)")
        conn.commit()
    for d in (
        state.online_users,
        state.hidden_sids,
        state.invisible,
        state.login_attempts,
        state.message_rate,
        state.rooms_voice,
        state.rooms_stream,
        state.sid_to_voice,
        auth_session.sid_users,
    ):
        d.clear()
    # Matching keeps live state in memory (queue, active matches)
    match_handlers._live.clear()
    match_handlers._last_partner.clear()
    match_handlers.queue = MatchQueue(blocked=match_handlers._blocked)
    yield


def create_user(username, password='secret123', screenname=None, answer='blue'):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO users (username, screenname, password, bio, security_question, security_answer)'
            ' VALUES (%s, %s, %s, %s, %s, %s)',
            (username, screenname or username.title(), hash_password(password), '', 'Q?', hash_password(answer)),
        )
        conn.commit()


def create_room(name, owner, members=(), admins=(), password=None):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO rooms (name, owner, members, admins, password, code) VALUES (%s, %s, %s, %s, %s, %s)',
            (name, owner, list(members), list(admins), password, str(abs(hash(name)) % 1000000).zfill(6)),
        )
        conn.commit()


def query(sql, *params):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        return cur.fetchall()


def events(client, name):
    """Drain the client's inbox and return the payloads of `name` events."""

    def payload(args):
        # The test client delivers the special 'message' event unwrapped
        if isinstance(args, list):
            return args[0] if args else None
        return args

    return [payload(e['args']) for e in client.get_received() if e['name'] == name]


def anon_client():
    return socketio.test_client(app)


def login(username, password='secret123'):
    """Log in over a fresh socket; returns (client, token)."""
    client = anon_client()
    client.emit('login', {'username': username, 'password': password})
    result = events(client, 'login_result')[0]
    assert result['success'], result
    return client, result['token']


def connect_as(username, password='secret123'):
    """Simulates a returning user: new socket that authenticates with a stored token."""
    first, token = login(username, password)
    first.disconnect()
    client = socketio.test_client(app, auth={'token': token})
    client.get_received()
    return client


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Expose each phase's result on the test item (used to keep e2e screenshots on failure)."""
    outcome = yield
    setattr(item, f'rep_{call.when}', outcome.get_result())

"""Server-side socket identity.

Clients never tell the server who they are. After a successful login the server
binds the username to the socket's sid and hands back a signed token; on later
connections the client presents that token in the Socket.IO `auth` payload and
the server re-binds the sid. Every handler reads identity from `sid_users`,
never from event data.

The token embeds a fingerprint of the user's password hash, so changing the
password (or deleting the account) invalidates every previously issued token.
"""

import functools
import hashlib
import logging
import secrets

import sentry_sdk
from flask import request
from flask_socketio import emit, join_room, rooms
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from db import get_db
from extensions import app, socketio
from state import online_users

log = logging.getLogger(__name__)

TOKEN_MAX_AGE = 60 * 60 * 24 * 30  # 30 days
GUEST_TOKEN_MAX_AGE = 60 * 60 * 24  # 1 day

# Demo visitors get ids like 'guest:3f9a...'. Real usernames can't contain ':',
# so a guest id can never collide with an account.
GUEST_PREFIX = 'guest:'

_serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='socket-auth')

sid_users: dict = {}  # { sid: username }

# Socket.IO room holding every signed-in (non-guest) socket. Presence changes go
# only here: guests and signed-out sockets must not learn who is online.
MEMBERS_ROOM = 'members'


def _pw_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def make_token(username: str, password_hash: str) -> str:
    return _serializer.dumps({'u': username, 'p': _pw_fingerprint(password_hash)})


def is_guest(username) -> bool:
    return isinstance(username, str) and username.startswith(GUEST_PREFIX)


def new_guest() -> tuple[str, str]:
    """A fresh read-only demo identity and its token."""
    guest = GUEST_PREFIX + secrets.token_hex(6)
    return guest, _serializer.dumps({'u': guest, 'g': True})


def verify_token(token: str):
    """Returns the username if the token is valid and still matches the stored password."""
    if not token:
        return None
    try:
        payload = _serializer.loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    username = payload.get('u')
    if payload.get('g'):
        # Guest tokens carry no account; they just keep the same demo id across reconnects
        try:
            _serializer.loads(token, max_age=GUEST_TOKEN_MAX_AGE)
        except SignatureExpired:
            return None
        return username if is_guest(username) else None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT password FROM users WHERE username = %s', (username,))
        row = cur.fetchone()
    if not row or _pw_fingerprint(row['password']) != payload.get('p'):
        return None
    return username


def bind(username: str):
    """Attach `username` to the current socket and mark it online (guests stay invisible)."""
    sid = request.sid
    if sid_users.get(sid) not in (None, username):
        unbind(sid)  # this socket was signed in as someone else
    sid_users[sid] = username
    if is_guest(username):
        return
    join_room(MEMBERS_ROOM)
    was_online = username in online_users
    online_users.setdefault(username, set()).add(sid)
    if not was_online:
        socketio.emit('online_status_changed', {'username': username, 'online': True}, to=MEMBERS_ROOM)


def unbind(sid: str):
    """Detach the socket; returns the username it belonged to (or None)."""
    username = sid_users.pop(sid, None)
    socketio.server.leave_room(sid, MEMBERS_ROOM, namespace='/')
    if username and username in online_users:
        online_users[username].discard(sid)
        if not online_users[username]:
            del online_users[username]
            socketio.emit('online_status_changed', {'username': username, 'online': False}, to=MEMBERS_ROOM)
    return username


def end_sessions(username: str, keep_sid: str | None = None):
    """Sign out every live socket of `username` (except `keep_sid`): used when the
    password changes or the account is renamed or deleted, since their tokens no
    longer verify and they must not keep acting as that user until they reconnect."""
    for sid in list(online_users.get(username, [])):
        if sid == keep_sid:
            continue
        socketio.emit('session_expired', {}, to=sid)
        unbind(sid)


def current_user():
    return sid_users.get(request.sid)


def _guarded(handler, allow_guest: bool):
    @functools.wraps(handler)
    def wrapper(data=None, *_args):
        username = current_user()
        if not username:
            emit('auth_required', {})
            return
        if is_guest(username) and not allow_guest:
            emit('guest_read_only', {})
            return
        # Errors reported from this event carry who triggered it and which event it was
        with sentry_sdk.isolation_scope() as scope:
            scope.set_tag('socket_event', handler.__name__)
            scope.set_user({'username': username})
            return handler(username, data if isinstance(data, dict) else {})

    return wrapper


def authenticated(handler):
    """Socket handler decorator: rejects unauthenticated sockets and demo guests,
    and passes the server-side username first: handler(username, data)."""
    return _guarded(handler, allow_guest=False)


def readable(handler):
    """Like `authenticated`, but demo guests may call it too. Only for handlers
    that read data; each must itself limit what a guest can see (is_guest)."""
    return _guarded(handler, allow_guest=True)


def in_room(room) -> bool:
    """True if the current socket has joined `room` (joins are permission-checked)."""
    return isinstance(room, str) and room in rooms()


def dm_participants(room: str):
    """('alice', 'bob') for 'dm:alice:bob', else None."""
    parts = room.split(':') if isinstance(room, str) else []
    if len(parts) != 3 or parts[0] != 'dm':
        return None
    return parts[1], parts[2]

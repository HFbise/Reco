"""Socket side of GitHub / Google sign-in (the redirect flow itself is in oauth.py).

The web app comes back from the provider with a ticket and trades it here for a
normal session, exactly like a password login.
"""

import logging
import secrets

import psycopg2
from flask_socketio import emit

import oauth
from auth_session import authenticated, password_fingerprint
from db import get_db
from extensions import socketio
from handlers.auth import MAX_SCREENNAME_LEN, sign_in
from moderation import USERNAME_RE, suspension_reply, username_available
from replies import fail
from utils import SECURITY_QUESTIONS, hash_password, str_field

log = logging.getLogger(__name__)


@socketio.on('oauth_login')
def handle_oauth_login(data):
    ticket = oauth.redeem_login_ticket(str_field(data, 'ticket'))
    if not ticket:
        fail('oauth_login_result', 'oauth_expired')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM users WHERE username = %s', (ticket['u'],))
            user = cur.fetchone()
        # A password change or rename since the ticket was issued makes it stale
        if not user or password_fingerprint(user['password']) != ticket['p']:
            fail('oauth_login_result', 'oauth_expired')
            return
        refused = suspension_reply(user)
        if refused:
            fail('oauth_login_result', *refused)
            return
        emit('oauth_login_result', sign_in(user, user['password']))
    except Exception as e:
        log.exception('oauth_login error: %s', e)
        fail('oauth_login_result', 'server_error')


@socketio.on('oauth_register')
def handle_oauth_register(data):
    """A new GitHub / Google identity picks its username and display name."""
    ticket = oauth.read_signup_ticket(str_field(data, 'ticket'))
    if not ticket:
        fail('oauth_register_result', 'oauth_expired')
        return
    username = str_field(data, 'username').strip().lower()
    screenname = str_field(data, 'screenname').strip()
    if not screenname or len(screenname) > MAX_SCREENNAME_LEN:
        fail('oauth_register_result', 'invalid_screenname', {'max': MAX_SCREENNAME_LEN})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            if not username_available(cur, username):
                code = 'invalid_username' if not USERNAME_RE.match(username) else 'username_taken'
                fail('oauth_register_result', code)
                return
            # No password of its own (has_password FALSE) until the user sets one; the stored
            # hash is of a random secret so password sign-in can't work, and it still anchors
            # the session token. Older databases require a security question on every user.
            password_hash = hash_password(secrets.token_urlsafe(32))
            cur.execute(
                'INSERT INTO users (username, screenname, password, bio, security_question, security_answer,'
                " has_password) VALUES (%s, %s, %s, '', %s, %s, FALSE) RETURNING *",
                (username, screenname, password_hash, SECURITY_QUESTIONS[0], hash_password(secrets.token_urlsafe(32))),
            )
            user = cur.fetchone()
            try:
                cur.execute(
                    'INSERT INTO oauth_accounts (provider, provider_id, username) VALUES (%s, %s, %s)',
                    (ticket['pv'], ticket['id'], username),
                )
            except psycopg2.errors.UniqueViolation:
                # This identity finished signing up already (a second tab, a double tap)
                conn.rollback()
                fail('oauth_register_result', 'already_linked')
                return
            conn.commit()
        emit('oauth_register_result', sign_in(user, password_hash))
    except psycopg2.errors.UniqueViolation:
        fail('oauth_register_result', 'username_taken')  # taken between the check and the insert
    except Exception as e:
        log.exception('oauth_register error: %s', e)
        fail('oauth_register_result', 'server_error')


@socketio.on('get_sign_in_methods')
@authenticated
def handle_get_sign_in_methods(username, _data):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT has_password FROM users WHERE username = %s', (username,))
        user = cur.fetchone()
        cur.execute('SELECT provider FROM oauth_accounts WHERE username = %s ORDER BY provider', (username,))
        linked = [r['provider'] for r in cur.fetchall()]
    emit(
        'sign_in_methods',
        {
            'success': True,
            'has_password': bool(user and user['has_password']),
            'linked': linked,
            'available': oauth.configured(),
        },
    )


@socketio.on('oauth_unlink')
@authenticated
def handle_oauth_unlink(username, data):
    provider = str_field(data, 'provider')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT has_password FROM users WHERE username = %s', (username,))
            has_password = cur.fetchone()['has_password']
            cur.execute('SELECT provider FROM oauth_accounts WHERE username = %s', (username,))
            linked = {r['provider'] for r in cur.fetchall()}
            if provider not in linked:
                fail('oauth_unlink_result', 'not_linked')
                return
            # Keep at least one way back in
            if not has_password and len(linked) == 1:
                fail('oauth_unlink_result', 'last_sign_in_method')
                return
            cur.execute('DELETE FROM oauth_accounts WHERE username = %s AND provider = %s', (username, provider))
            conn.commit()
        emit('oauth_unlink_result', {'success': True, 'provider': provider})
    except Exception as e:
        log.exception('oauth_unlink error: %s', e)
        fail('oauth_unlink_result', 'server_error')

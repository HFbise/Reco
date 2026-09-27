import logging
import re

from flask import request
from flask_socketio import emit

import demo
from auth_session import authenticated, bind, end_sessions, is_guest, make_token, readable, unbind
from db import get_db
from extensions import socketio
from moderation import RESERVED_USERNAMES, USERNAME_RE, delete_account
from replies import fail
from state import check_login_rate, record_login_fail, reset_login_attempts
from utils import SECURITY_QUESTIONS, hash_password, security_question_id, str_field, verify_password

log = logging.getLogger(__name__)

MAX_SCREENNAME_LEN = 32
MAX_BIO_LEN = 200
MIN_PASSWORD_LEN = 6
AVATAR_EXPRESSIONS = {'Smile', 'Laugh', 'BigLaugh', 'Angi', 'Sad', 'Em'}  # AvatarView.EXPRESSIONS
AVATAR_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


@socketio.on('register')
def handle_register(data):
    username = str_field(data, 'username').strip().lower()
    screenname = str_field(data, 'screenname').strip()
    password = str_field(data, 'password')
    bio = str_field(data, 'bio').strip()[:MAX_BIO_LEN]
    security_q = security_question_id(str_field(data, 'security_question'))
    security_a = str_field(data, 'security_answer').strip().lower()

    if not USERNAME_RE.match(username):
        fail('register_result', 'invalid_username')
        return
    if username in RESERVED_USERNAMES:
        fail('register_result', 'username_taken')
        return
    if not screenname or len(screenname) > MAX_SCREENNAME_LEN:
        fail('register_result', 'invalid_screenname', {'max': MAX_SCREENNAME_LEN})
        return
    if len(password) < MIN_PASSWORD_LEN:
        fail('register_result', 'password_too_short', {'min': MIN_PASSWORD_LEN})
        return
    if not security_q or not security_a:
        fail('register_result', 'missing_fields')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT 1 FROM users WHERE username = %s UNION SELECT 1 FROM deleted_usernames WHERE username = %s',
                (username, username),
            )
            if cur.fetchone():
                fail('register_result', 'username_taken')
                return
            cur.execute(
                'INSERT INTO users (username, screenname, password, bio, security_question, security_answer)'
                ' VALUES (%s, %s, %s, %s, %s, %s)',
                (username, screenname, hash_password(password), bio, security_q, hash_password(security_a)),
            )
            conn.commit()
        emit('register_result', {'success': True})
    except Exception as e:
        log.exception('register error: %s', e)
        fail('register_result', 'server_error')


@socketio.on('login')
def handle_login(data):
    username = str_field(data, 'username').strip().lower()
    password = str_field(data, 'password')
    if not username or not password:
        fail('login_result', 'missing_fields')
        return

    allowed, secs = check_login_rate(username)
    if not allowed:
        fail('login_result', 'too_many_attempts', {'secs': secs})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM users WHERE LOWER(username) = %s', (username,))
            user = cur.fetchone()
        if not user:
            fail('login_result', 'user_not_found')
            return
        ok, needs_migrate = verify_password(user['password'], password)
        if not ok:
            record_login_fail(username)
            fail('login_result', 'wrong_password')
            return
        reset_login_attempts(username)
        stored_hash = user['password']
        if needs_migrate:
            stored_hash = hash_password(password)
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute('UPDATE users SET password = %s WHERE username = %s', (stored_hash, user['username']))
                conn.commit()
        bind(user['username'])
        emit(
            'login_result',
            {
                'success': True,
                'username': user['username'],
                'token': make_token(user['username'], stored_hash),
                'screenname': user['screenname'],
                'bio': user.get('bio') or '',
                'avatar_expression': user.get('avatar_expression') or 'Smile',
                'avatar_color': user.get('avatar_color') or '#5865F2',
            },
        )
    except Exception as e:
        log.exception('login error: %s', e)
        fail('login_result', 'server_error')


@socketio.on('get_profile')
@readable
def handle_get_profile(username, data):
    target = str_field(data, 'username')
    if is_guest(username) and target not in demo.PERSONAS:
        emit('profile_result', {'success': False})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT screenname, bio, avatar_expression, avatar_color FROM users WHERE username = %s',
                (target,),
            )
            user = cur.fetchone()
        if not user:
            emit('profile_result', {'success': False})
            return
        emit(
            'profile_result',
            {
                'success': True,
                'screenname': user['screenname'],
                'bio': user['bio'],
                'avatar_expression': user.get('avatar_expression') or 'Smile',
                'avatar_color': user.get('avatar_color') or '#5865F2',
            },
        )
    except Exception as e:
        log.exception('get_profile error: %s', e)
        emit('profile_result', {'success': False})


@socketio.on('update_profile')
@authenticated
def handle_update_profile(username, data):
    try:
        screenname = str_field(data, 'screenname').strip()
        bio = str_field(data, 'bio').strip()
        if not screenname or len(screenname) > MAX_SCREENNAME_LEN or len(bio) > MAX_BIO_LEN:
            fail('update_profile_result', 'invalid_profile', {'max_name': MAX_SCREENNAME_LEN, 'max_bio': MAX_BIO_LEN})
            return
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE users SET screenname = %s, bio = %s WHERE username = %s', (screenname, bio, username))
            conn.commit()
        emit('update_profile_result', {'success': True, 'screenname': screenname, 'bio': bio})
    except Exception as e:
        log.exception('update_profile error: %s', e)
        fail('update_profile_result', 'server_error')


@socketio.on('change_password')
@authenticated
def handle_change_password(username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT password FROM users WHERE username = %s', (username,))
            user = cur.fetchone()
            ok, _ = verify_password(user['password'], str_field(data, 'old_password'))
            if not ok:
                fail('change_password_result', 'wrong_old_password')
                return
            new_password = str_field(data, 'new_password')
            if len(new_password) < MIN_PASSWORD_LEN:
                fail('change_password_result', 'password_too_short', {'min': MIN_PASSWORD_LEN})
                return
            new_hash = hash_password(new_password)
            cur.execute('UPDATE users SET password = %s WHERE username = %s', (new_hash, username))
            conn.commit()
        end_sessions(username, keep_sid=request.sid)  # other devices must sign in again
        emit('change_password_result', {'success': True, 'token': make_token(username, new_hash)})
    except Exception as e:
        log.exception('change_password error: %s', e)
        fail('change_password_result', 'server_error')


@socketio.on('get_security_question')
def handle_get_security_question(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT security_question FROM users WHERE username = %s', (str_field(data, 'username').strip(),)
            )
            user = cur.fetchone()
        if not user:
            fail('security_question_result', 'user_not_found')
            return
        stored = user['security_question'] or ''
        # An id the client can translate; unknown legacy text is passed through as-is
        emit('security_question_result', {'success': True, 'question': security_question_id(stored) or stored})
    except Exception as e:
        log.exception('get_security_question error: %s', e)
        fail('security_question_result', 'server_error')


@socketio.on('reset_password')
def handle_reset_password(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            username = str_field(data, 'username').strip()
            answer = str_field(data, 'answer').strip().lower()
            new_password = str_field(data, 'new_password')
            rate_key = f'reset:{username.lower()}'
            allowed, secs = check_login_rate(rate_key)
            if not allowed:
                fail('reset_password_result', 'too_many_attempts', {'secs': secs})
                return
            cur.execute('SELECT security_answer FROM users WHERE username = %s', (username,))
            user = cur.fetchone()
            ok, needs_migrate = (
                verify_password(user['security_answer'], answer) if user and user['security_answer'] else (False, False)
            )
            if not ok:
                record_login_fail(rate_key)
                fail('reset_password_result', 'wrong_answer')
                return
            reset_login_attempts(rate_key)
            if len(new_password) < MIN_PASSWORD_LEN:
                fail('reset_password_result', 'password_too_short', {'min': MIN_PASSWORD_LEN})
                return
            cur.execute('UPDATE users SET password = %s WHERE username = %s', (hash_password(new_password), username))
            if needs_migrate:
                cur.execute(
                    'UPDATE users SET security_answer = %s WHERE username = %s', (hash_password(answer), username)
                )
            conn.commit()
        end_sessions(username)  # whoever was signed in with the old password is signed out
        emit('reset_password_result', {'success': True})
    except Exception as e:
        log.exception('reset_password error: %s', e)
        fail('reset_password_result', 'server_error')


@socketio.on('get_questions_list')
def handle_get_questions(*_args):
    emit('questions_list', {'questions': SECURITY_QUESTIONS})


@socketio.on('save_avatar')
@authenticated
def handle_save_avatar(username, data):
    expression = str_field(data, 'expression')
    color = str_field(data, 'color')
    if expression not in AVATAR_EXPRESSIONS or not AVATAR_COLOR_RE.match(color):
        fail('save_avatar_result', 'invalid_avatar')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'UPDATE users SET avatar_expression = %s, avatar_color = %s WHERE username = %s',
                (expression, color, username),
            )
            conn.commit()
        emit('save_avatar_result', {'success': True, 'expression': expression, 'color': color})
    except Exception as e:
        log.exception('save_avatar error: %s', e)
        fail('save_avatar_result', 'server_error')


@socketio.on('delete_account')
@authenticated
def handle_delete_account(username, data):
    password = str_field(data, 'password')
    if not password:
        fail('delete_account_result', 'missing_fields')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT password FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            if not row:
                fail('delete_account_result', 'user_not_found')
                return
            ok, _ = verify_password(row['password'], password)
            if not ok:
                fail('delete_account_result', 'wrong_password')
                return
            delete_account(cur, username)
            conn.commit()
        unbind(request.sid)
        end_sessions(username)
        emit('delete_account_result', {'success': True})
    except Exception as e:
        log.exception('delete_account error: %s', e)
        fail('delete_account_result', 'server_error')

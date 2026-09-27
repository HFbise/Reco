import logging
from flask import request
from flask_socketio import emit
from extensions import socketio
from db import get_db
from replies import fail
from state import check_login_rate, record_login_fail, reset_login_attempts
from utils import hash_password, verify_password, SECURITY_QUESTIONS, security_question_id
from auth_session import make_token, bind, unbind, authenticated
from moderation import USERNAME_RE, RESERVED_USERNAMES, delete_account

log = logging.getLogger(__name__)

MAX_SCREENNAME_LEN = 32
MAX_BIO_LEN = 200


@socketio.on('register')
def handle_register(data):
    username = data['username'].strip().lower()
    screenname = data['screenname'].strip()
    password = data['password']
    bio = data.get('bio', '').strip()
    security_q = security_question_id(data.get('security_question', ''))
    security_a = data['security_answer'].strip().lower()

    if not USERNAME_RE.match(username):
        fail('register_result', 'invalid_username')
        return
    if username in RESERVED_USERNAMES:
        fail('register_result', 'username_taken')
        return
    if not screenname or len(screenname) > MAX_SCREENNAME_LEN:
        fail('register_result', 'invalid_screenname', {'max': MAX_SCREENNAME_LEN})
        return
    if len(password) < 6:
        fail('register_result', 'password_too_short', {'min': 6})
        return
    if not security_q or not security_a:
        fail('register_result', 'missing_fields')
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT 1 FROM users WHERE username = %s'
                        ' UNION SELECT 1 FROM deleted_usernames WHERE username = %s', (username, username))
            if cur.fetchone():
                fail('register_result', 'username_taken')
                return
            cur.execute(
                'INSERT INTO users (username, screenname, password, bio, security_question, security_answer)'
                ' VALUES (%s, %s, %s, %s, %s, %s)',
                (username, screenname, hash_password(password), bio, security_q, hash_password(security_a))
            )
            conn.commit()
        emit('register_result', {'success': True})
    except Exception as e:
        log.exception('register error: %s', e)
        fail('register_result', 'server_error')


@socketio.on('login')
def handle_login(data):
    username = data['username'].strip().lower()
    password = data['password']

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
                cur.execute('UPDATE users SET password = %s WHERE username = %s',
                            (stored_hash, user['username']))
                conn.commit()
        bind(user['username'])
        emit('login_result', {
            'success': True,
            'username': user['username'],
            'token': make_token(user['username'], stored_hash),
            'screenname': user['screenname'],
            'bio': user.get('bio') or '',
            'avatar_expression': user.get('avatar_expression') or 'Smile',
            'avatar_color': user.get('avatar_color') or '#5865F2',
        })
    except Exception as e:
        log.exception('login error: %s', e)
        fail('login_result', 'server_error')


@socketio.on('get_profile')
@authenticated
def handle_get_profile(_username, data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT screenname, bio, avatar_expression, avatar_color FROM users WHERE username = %s',
                (data.get('username', ''),)
            )
            user = cur.fetchone()
        if not user:
            emit('profile_result', {'success': False})
            return
        emit('profile_result', {
            'success': True,
            'screenname': user['screenname'],
            'bio': user['bio'],
            'avatar_expression': user.get('avatar_expression') or 'Smile',
            'avatar_color': user.get('avatar_color') or '#5865F2',
        })
    except Exception as e:
        log.exception('get_profile error: %s', e)
        emit('profile_result', {'success': False})


@socketio.on('update_profile')
@authenticated
def handle_update_profile(username, data):
    try:
        screenname = (data.get('screenname') or '').strip()
        bio = (data.get('bio') or '').strip()
        if not screenname or len(screenname) > MAX_SCREENNAME_LEN or len(bio) > MAX_BIO_LEN:
            fail('update_profile_result', 'invalid_profile',
                 {'max_name': MAX_SCREENNAME_LEN, 'max_bio': MAX_BIO_LEN})
            return
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE users SET screenname = %s, bio = %s WHERE username = %s',
                        (screenname, bio, username))
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
            ok, _ = verify_password(user['password'], data['old_password'])
            if not ok:
                fail('change_password_result', 'wrong_old_password')
                return
            if len(data['new_password']) < 6:
                fail('change_password_result', 'password_too_short', {'min': 6})
                return
            new_hash = hash_password(data['new_password'])
            cur.execute('UPDATE users SET password = %s WHERE username = %s', (new_hash, username))
            conn.commit()
        emit('change_password_result', {'success': True, 'token': make_token(username, new_hash)})
    except Exception as e:
        log.exception('change_password error: %s', e)
        fail('change_password_result', 'server_error')


@socketio.on('get_security_question')
def handle_get_security_question(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT security_question FROM users WHERE username = %s',
                        (data['username'].strip(),))
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
            username = data['username'].strip()
            answer = data['answer'].strip().lower()
            rate_key = f'reset:{username.lower()}'
            allowed, secs = check_login_rate(rate_key)
            if not allowed:
                fail('reset_password_result', 'too_many_attempts', {'secs': secs})
                return
            cur.execute('SELECT security_answer FROM users WHERE username = %s', (username,))
            user = cur.fetchone()
            ok, needs_migrate = (verify_password(user['security_answer'], answer)
                                 if user and user['security_answer'] else (False, False))
            if not ok:
                record_login_fail(rate_key)
                fail('reset_password_result', 'wrong_answer')
                return
            reset_login_attempts(rate_key)
            if len(data['new_password']) < 6:
                fail('reset_password_result', 'password_too_short', {'min': 6})
                return
            cur.execute('UPDATE users SET password = %s WHERE username = %s',
                        (hash_password(data['new_password']), username))
            if needs_migrate:
                cur.execute('UPDATE users SET security_answer = %s WHERE username = %s',
                            (hash_password(answer), username))
            conn.commit()
        emit('reset_password_result', {'success': True})
    except Exception as e:
        log.exception('reset_password error: %s', e)
        fail('reset_password_result', 'server_error')


@socketio.on('get_questions_list')
def handle_get_questions():
    emit('questions_list', {'questions': SECURITY_QUESTIONS})


@socketio.on('save_avatar')
@authenticated
def handle_save_avatar(username, data):
    expression = data.get('expression', 'Smile')
    color = data.get('color', '#5865F2')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'UPDATE users SET avatar_expression = %s, avatar_color = %s WHERE username = %s',
                (expression, color, username)
            )
            conn.commit()
        emit('save_avatar_result', {'success': True, 'expression': expression, 'color': color})
    except Exception as e:
        log.exception('save_avatar error: %s', e)
        fail('save_avatar_result', 'server_error')


@socketio.on('delete_account')
@authenticated
def handle_delete_account(username, data):
    password = data.get('password', '')
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
        emit('delete_account_result', {'success': True})
    except Exception as e:
        log.exception('delete_account error: %s', e)
        fail('delete_account_result', 'server_error')

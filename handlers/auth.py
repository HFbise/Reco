import logging
from flask import request
from flask_socketio import emit
from extensions import socketio
from db import get_db
from state import check_login_rate, record_login_fail, reset_login_attempts
from utils import hash_password, verify_password, SECURITY_QUESTIONS, SERVER_ERROR
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
    security_q = data['security_question']
    security_a = data['security_answer'].strip().lower()

    if not USERNAME_RE.match(username):
        emit('register_result', {'success': False, 'msg': '用户名需为 3-20 位小写字母、数字或下划线'})
        return
    if username in RESERVED_USERNAMES:
        emit('register_result', {'success': False, 'msg': '用户名已存在'})
        return
    if not screenname or len(screenname) > MAX_SCREENNAME_LEN:
        emit('register_result', {'success': False, 'msg': f'显示名需为 1-{MAX_SCREENNAME_LEN} 个字符'})
        return
    if len(password) < 6:
        emit('register_result', {'success': False, 'msg': '密码至少6位'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT 1 FROM users WHERE username = %s'
                        ' UNION SELECT 1 FROM deleted_usernames WHERE username = %s', (username, username))
            if cur.fetchone():
                emit('register_result', {'success': False, 'msg': '用户名已存在'})
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
        emit('register_result', {'success': False, 'msg': SERVER_ERROR})


@socketio.on('login')
def handle_login(data):
    username = data['username'].strip().lower()
    password = data['password']

    allowed, secs = check_login_rate(username)
    if not allowed:
        emit('login_result', {'success': False, 'msg': f'登录尝试过多，请 {secs} 秒后重试'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT * FROM users WHERE LOWER(username) = %s', (username,))
            user = cur.fetchone()
        if not user:
            emit('login_result', {'success': False, 'msg': '用户名不存在'})
            return
        ok, needs_migrate = verify_password(user['password'], password)
        if not ok:
            record_login_fail(username)
            emit('login_result', {'success': False, 'msg': '密码错误'})
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
        emit('login_result', {'success': False, 'msg': SERVER_ERROR})


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
            emit('update_profile_result', {'success': False,
                                           'msg': f'显示名 1-{MAX_SCREENNAME_LEN} 字，简介最多 {MAX_BIO_LEN} 字'})
            return
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE users SET screenname = %s, bio = %s WHERE username = %s',
                        (screenname, bio, username))
            conn.commit()
        emit('update_profile_result', {'success': True, 'screenname': screenname, 'bio': bio})
    except Exception as e:
        log.exception('update_profile error: %s', e)
        emit('update_profile_result', {'success': False, 'msg': SERVER_ERROR})


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
                emit('change_password_result', {'success': False, 'msg': '旧密码错误'})
                return
            if len(data['new_password']) < 6:
                emit('change_password_result', {'success': False, 'msg': '新密码至少6位'})
                return
            new_hash = hash_password(data['new_password'])
            cur.execute('UPDATE users SET password = %s WHERE username = %s', (new_hash, username))
            conn.commit()
        emit('change_password_result', {'success': True, 'token': make_token(username, new_hash)})
    except Exception as e:
        log.exception('change_password error: %s', e)
        emit('change_password_result', {'success': False, 'msg': SERVER_ERROR})


@socketio.on('get_security_question')
def handle_get_security_question(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT security_question FROM users WHERE username = %s',
                        (data['username'].strip(),))
            user = cur.fetchone()
        if not user:
            emit('security_question_result', {'success': False, 'msg': '用户名不存在'})
            return
        emit('security_question_result', {'success': True, 'question': user['security_question']})
    except Exception as e:
        log.exception('get_security_question error: %s', e)
        emit('security_question_result', {'success': False, 'msg': SERVER_ERROR})


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
                emit('reset_password_result', {'success': False, 'msg': f'尝试过多，请 {secs} 秒后重试'})
                return
            cur.execute('SELECT security_answer FROM users WHERE username = %s', (username,))
            user = cur.fetchone()
            ok, needs_migrate = (verify_password(user['security_answer'], answer)
                                 if user and user['security_answer'] else (False, False))
            if not ok:
                record_login_fail(rate_key)
                emit('reset_password_result', {'success': False, 'msg': '答案错误'})
                return
            reset_login_attempts(rate_key)
            if len(data['new_password']) < 6:
                emit('reset_password_result', {'success': False, 'msg': '新密码至少6位'})
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
        emit('reset_password_result', {'success': False, 'msg': SERVER_ERROR})


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
        emit('save_avatar_result', {'success': False, 'msg': SERVER_ERROR})


@socketio.on('delete_account')
@authenticated
def handle_delete_account(username, data):
    password = data.get('password', '')
    if not password:
        emit('delete_account_result', {'success': False, 'msg': '参数缺失'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT password FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            if not row:
                emit('delete_account_result', {'success': False, 'msg': '用户不存在'})
                return
            ok, _ = verify_password(row['password'], password)
            if not ok:
                emit('delete_account_result', {'success': False, 'msg': '密码错误'})
                return
            delete_account(cur, username)
            conn.commit()
        unbind(request.sid)
        emit('delete_account_result', {'success': True})
    except Exception as e:
        log.exception('delete_account error: %s', e)
        emit('delete_account_result', {'success': False, 'msg': SERVER_ERROR})

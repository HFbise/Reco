import logging
from flask_socketio import emit
from extensions import socketio
from db import get_db
from state import check_login_rate, record_login_fail, reset_login_attempts
from utils import hash_password, verify_password, SECURITY_QUESTIONS, DEFAULT_PASSWORD

log = logging.getLogger(__name__)


@socketio.on('register')
def handle_register(data):
    username = data['username'].strip().lower()
    screenname = data['screenname'].strip()
    password = data['password']
    bio = data.get('bio', '').strip()
    security_q = data['security_question']
    security_a = data['security_answer'].strip().lower()

    if len(username) < 3:
        emit('register_result', {'success': False, 'msg': '用户名至少3位'})
        return
    if len(password) < 6:
        emit('register_result', {'success': False, 'msg': '密码至少6位'})
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT username FROM users WHERE username = %s', (username,))
            if cur.fetchone():
                emit('register_result', {'success': False, 'msg': '用户名已存在'})
                return
            cur.execute(
                'INSERT INTO users (username, screenname, password, bio, security_question, security_answer)'
                ' VALUES (%s, %s, %s, %s, %s, %s)',
                (username, screenname, hash_password(password), bio, security_q, security_a)
            )
            conn.commit()
        emit('register_result', {'success': True})
    except Exception as e:
        log.error('register error: %s', e)
        emit('register_result', {'success': False, 'msg': str(e)})


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
        if needs_migrate:
            with get_db() as conn:
                cur = conn.cursor()
                cur.execute('UPDATE users SET password = %s WHERE username = %s',
                            (hash_password(password), username))
                conn.commit()
        emit('login_result', {
            'success': True,
            'username': username,
            'screenname': user['screenname'],
            'bio': user.get('bio') or '',
            'avatar_expression': user.get('avatar_expression') or 'Smile',
            'avatar_color': user.get('avatar_color') or '#5865F2',
        })
    except Exception as e:
        log.error('login error: %s', e)
        emit('login_result', {'success': False, 'msg': str(e)})


@socketio.on('get_profile')
def handle_get_profile(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'SELECT screenname, bio, avatar_expression, avatar_color FROM users WHERE username = %s',
                (data['username'],)
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
        log.error('get_profile error: %s', e)
        emit('profile_result', {'success': False})


@socketio.on('update_profile')
def handle_update_profile(data):
    try:
        screenname = data['screenname'].strip()
        bio = data['bio'].strip()
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('UPDATE users SET screenname = %s, bio = %s WHERE username = %s',
                        (screenname, bio, data['username']))
            conn.commit()
        emit('update_profile_result', {'success': True, 'screenname': screenname, 'bio': bio})
    except Exception as e:
        log.error('update_profile error: %s', e)
        emit('update_profile_result', {'success': False, 'msg': str(e)})


@socketio.on('change_password')
def handle_change_password(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT password FROM users WHERE username = %s', (data['username'],))
            user = cur.fetchone()
            ok, _ = verify_password(user['password'], data['old_password'])
            if not ok:
                emit('change_password_result', {'success': False, 'msg': '旧密码错误'})
                return
            if len(data['new_password']) < 6:
                emit('change_password_result', {'success': False, 'msg': '新密码至少6位'})
                return
            cur.execute('UPDATE users SET password = %s WHERE username = %s',
                        (hash_password(data['new_password']), data['username']))
            conn.commit()
        emit('change_password_result', {'success': True})
    except Exception as e:
        log.error('change_password error: %s', e)
        emit('change_password_result', {'success': False, 'msg': str(e)})


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
        log.error('get_security_question error: %s', e)
        emit('security_question_result', {'success': False, 'msg': str(e)})


@socketio.on('reset_password')
def handle_reset_password(data):
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT security_answer FROM users WHERE username = %s',
                        (data['username'].strip(),))
            user = cur.fetchone()
            if not user or user['security_answer'] != data['answer'].strip().lower():
                emit('reset_password_result', {'success': False, 'msg': '答案错误'})
                return
            if len(data['new_password']) < 6:
                emit('reset_password_result', {'success': False, 'msg': '新密码至少6位'})
                return
            cur.execute('UPDATE users SET password = %s WHERE username = %s',
                        (hash_password(data['new_password']), data['username']))
            conn.commit()
        emit('reset_password_result', {'success': True})
    except Exception as e:
        log.error('reset_password error: %s', e)
        emit('reset_password_result', {'success': False, 'msg': str(e)})


@socketio.on('get_questions_list')
def handle_get_questions():
    emit('questions_list', {'questions': SECURITY_QUESTIONS})


@socketio.on('save_avatar')
def handle_save_avatar(data):
    username = data.get('username', '')
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
        log.error('save_avatar error: %s', e)
        emit('save_avatar_result', {'success': False, 'msg': str(e)})


@socketio.on('delete_account')
def handle_delete_account(data):
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')
    if not username or not password:
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
            cur.execute(
                'UPDATE rooms SET members = array_remove(members, %s),'
                ' admins = array_remove(admins, %s)',
                (username, username)
            )
            cur.execute('DELETE FROM blocks WHERE blocker = %s OR blocked = %s',
                        (username, username))
            cur.execute('DELETE FROM users WHERE username = %s', (username,))
            conn.commit()
        emit('delete_account_result', {'success': True})
    except Exception as e:
        log.error('delete_account error: %s', e)
        emit('delete_account_result', {'success': False, 'msg': str(e)})

import os
import random
import string
import hmac
import hashlib
import base64
import time
from dotenv import load_dotenv
load_dotenv()
import json
from datetime import datetime, timezone
from flask import Flask, render_template, send_from_directory, session, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor


app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(32).hex())

_cors = os.environ.get('CORS_ORIGINS', '*')
socketio = SocketIO(app, async_mode='threading',
                    cors_allowed_origins=_cors if _cors == '*' else _cors.split(','))

DATABASE_URL = os.environ.get('DATABASE_URL')
_pool = pg_pool.ThreadedConnectionPool(2, 10, DATABASE_URL, cursor_factory=RealDictCursor)

class _Conn:
    """Wraps a pooled connection so conn.close() returns it to the pool."""
    def __init__(self, conn):
        self._c = conn
    def __getattr__(self, name):
        return getattr(self._c, name)
    def close(self):
        try:
            if self._c.status != 0:  # 0 = STATUS_READY (no pending transaction)
                self._c.rollback()
        except Exception:
            pass
        _pool.putconn(self._c)
    def __enter__(self):
        return self
    def __exit__(self, *_):
        self.close()

SECURITY_QUESTIONS = [
    "你的出生城市是？",
    "你的小学名字是？",
    "你最喜欢的宠物名字是？",
    "你母亲的娘家姓是？",
    "你的第一辆车的品牌是？",
    "你最喜欢的老师叫什么？"
]

DEFAULT_PASSWORD = "reco1234"

_site_admins: set = set()  # 从 DB 加载，避免硬编码

def load_site_admins():
    global _site_admins
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE is_admin = TRUE")
        _site_admins = {row['username'] for row in cur.fetchall()}
        conn.close()
    except Exception as e:
        print('加载站点管理员失败:', e)

def is_site_admin(username: str) -> bool:
    return username in _site_admins

def get_level(username, room_data):
    """返回用户在房间内的权限级别: 3=站点管理员, 2=房主, 1=房间管理员, 0=普通成员"""
    if is_site_admin(username):
        return 3
    if username == (room_data.get('owner') or ''):
        return 2
    if username in (room_data.get('admins') or []):
        return 1
    return 0

def hash_password(pw):
    return generate_password_hash(pw)

def verify_password(stored, provided, username=None):
    """支持旧明文密码的懒迁移：验证通过后自动升级为哈希"""
    if stored.startswith('pbkdf2:') or stored.startswith('scrypt:'):
        return check_password_hash(stored, provided), False
    # 明文，验证后标记需要迁移
    return stored == provided, stored == provided

# ── 内存状态 ─────────────────────────────────────────────
rooms_voice = {}
rooms_stream = {}        # { room: { username: screenname } }
rooms_text_muted = {}    # { room: { username: expiry_or_None } }
online_users = {}        # { username: set of sids }
sid_to_voice = {}        # { sid: (username, room) } — for cleanup on disconnect
pending_invites = {}     # { room: set(usernames) } — 待接受的邀请，加入时跳过密码验证
message_rate = {}        # { username: [timestamps] }
login_attempts = {}      # { username: {'count': N, 'until': float} }
push_tokens = {}         # { username: [expo_push_token, ...] }

def _check_msg_rate(username, max_msgs=8, window=10):
    """返回 True 表示允许，False 表示超速。"""
    now = time.time()
    ts = [t for t in message_rate.get(username, []) if now - t < window]
    if len(ts) >= max_msgs:
        message_rate[username] = ts
        return False
    ts.append(now)
    message_rate[username] = ts
    return True

def _check_login_rate(username):
    """返回 (allowed, seconds_left)。"""
    now = time.time()
    d = login_attempts.get(username, {})
    until = d.get('until', 0)
    if until > now:
        return False, int(until - now)
    return True, 0

def _record_login_fail(username):
    now = time.time()
    d = login_attempts.get(username, {'count': 0})
    d['count'] = d.get('count', 0) + 1
    if d['count'] >= 10:
        d['until'] = now + 300   # 5分钟锁定
        d['count'] = 0
    login_attempts[username] = d

def _reset_login_attempts(username):
    login_attempts.pop(username, None)

def get_db() -> _Conn:
    return _Conn(_pool.getconn())

def emit_system_msg(room, text):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text, time, system) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id',
            (room, 'system', '系统', text, datetime.now().strftime('%H:%M'), True)
        )
        msg_id = cur.fetchone()['id']
        conn.commit()
        conn.close()
        emit('message', {
            'id': msg_id,
            'username': 'system',
            'screenname': '系统',
            'text': text,
            'time': datetime.now(timezone.utc).isoformat(),
            'room': room,
            'system': True,
        }, to=room)
    except Exception as e:
        print('系统消息失败:', e)

# ── 在线状态 ─────────────────────────────────────────────
@socketio.on('user_online')
def handle_user_online(data):
    username = data['username']
    if username not in online_users:
        online_users[username] = set()
    online_users[username].add(request.sid)
    socketio.emit('online_status_changed', {'username': username, 'online': True})

@socketio.on('user_offline')
def handle_user_offline(data):
    username = data['username']
    if username in online_users:
        online_users[username].discard(request.sid)
        if not online_users[username]:
            del online_users[username]
            socketio.emit('online_status_changed', {'username': username, 'online': False})

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    for username, sids in list(online_users.items()):
        if sid in sids:
            sids.discard(sid)
            if not sids:
                del online_users[username]
                socketio.emit('online_status_changed', {'username': username, 'online': False})
            break
    # Remove from voice if the tab/app was closed without calling voice_leave
    if sid in sid_to_voice:
        username, room = sid_to_voice.pop(sid)
        if room in rooms_voice:
            rooms_voice[room]['voice_members'] = [
                m for m in rooms_voice[room]['voice_members'] if m['username'] != username
            ]
        socketio.emit('voice_user_left', {'username': username}, to=room)

# ── 页面路由 ──────────────────────────────────────────────
DIST_DIR = os.path.join(os.path.dirname(__file__), 'app', 'dist')

@app.route('/')
def index():
    if os.path.isdir(DIST_DIR):
        return send_from_directory(DIST_DIR, 'index.html')
    return render_template('index.html')

@app.route('/<path:path>')
def spa_static(path):
    if os.path.isdir(DIST_DIR):
        full = os.path.join(DIST_DIR, path)
        if os.path.isfile(full):
            return send_from_directory(DIST_DIR, path)
        return send_from_directory(DIST_DIR, 'index.html')
    return render_template('index.html')

@app.route('/privacy')
def privacy_policy():
    return '''<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reco 隐私政策</title>
<style>body{font-family:-apple-system,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}h1{color:#4f8ef7}h2{margin-top:2em}a{color:#4f8ef7}</style>
</head><body>
<h1>Reco 隐私政策</h1>
<p>最后更新：2026年</p>
<h2>我们收集的信息</h2>
<p>Reco 收集以下信息以提供服务：</p>
<ul>
<li>账号信息：用户名、显示名、密码（加密存储）、个人简介</li>
<li>消息内容：你在聊天室和私信中发送的文字</li>
<li>设备信息：推送通知令牌（用于离线消息推送）</li>
</ul>
<h2>信息的使用方式</h2>
<p>我们仅将收集的信息用于运营 Reco 服务，包括：显示消息、发送推送通知、账号管理。我们不会将你的信息出售给第三方。</p>
<h2>数据存储</h2>
<p>数据存储于 Supabase（PostgreSQL）云数据库，位于美国。</p>
<h2>账号删除</h2>
<p>你可以随时在 App 内「我的资料 → 删除账号」永久删除账号及相关数据。</p>
<h2>联系我们</h2>
<p>如有隐私相关问题，请联系：<a href="mailto:a1522a@gmail.com">a1522a@gmail.com</a></p>
</body></html>''', 200, {'Content-Type': 'text/html; charset=utf-8'}

@app.route('/sw.js')
def service_worker():
    resp = app.send_static_file('sw.js')
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp

TURN_HOST   = os.environ.get('TURN_HOST', '129.153.163.143')
TURN_PORT   = int(os.environ.get('TURN_PORT', '3478'))
TURN_SECRET = os.environ.get('TURN_SECRET', '')

@app.route('/api/voice-leave', methods=['POST'])
def api_voice_leave():
    try:
        body = request.get_data(as_text=True)
        data = json.loads(body)
    except Exception:
        data = {}
    username = data.get('username', '')
    room = data.get('room', '')
    if username and room and room in rooms_voice:
        rooms_voice[room]['voice_members'] = [
            m for m in rooms_voice[room]['voice_members'] if m['username'] != username
        ]
        socketio.emit('voice_user_left', {'username': username}, to=room)
    return '', 204

@app.route('/api/ice-servers')
def get_ice_servers():
    username = request.args.get('u', '').strip()
    if not username or not TURN_SECRET:
        return jsonify([])
    expiry       = int(time.time()) + 86400          # 24小时有效
    turn_user    = f'{expiry}:{username}'
    turn_pass    = base64.b64encode(
        hmac.new(TURN_SECRET.encode(), turn_user.encode(), hashlib.sha1).digest()
    ).decode()
    return jsonify([
        {'urls': f'stun:{TURN_HOST}:{TURN_PORT}'},
        {'urls': f'turn:{TURN_HOST}:{TURN_PORT}',               'username': turn_user, 'credential': turn_pass},
        {'urls': f'turn:{TURN_HOST}:{TURN_PORT}?transport=tcp', 'username': turn_user, 'credential': turn_pass},
    ])

# ── 用户注册 ──────────────────────────────────────────────
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
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT username FROM users WHERE username = %s', (username,))
        if cur.fetchone():
            emit('register_result', {'success': False, 'msg': '用户名已存在'})
            conn.close()
            return
        cur.execute(
            'INSERT INTO users (username, screenname, password, bio, security_question, security_answer) VALUES (%s, %s, %s, %s, %s, %s)',
            (username, screenname, hash_password(password), bio, security_q, security_a)
        )
        conn.commit()
        conn.close()
        emit('register_result', {'success': True})
    except Exception as e:
        emit('register_result', {'success': False, 'msg': str(e)})

# ── 用户登录 ──────────────────────────────────────────────
@socketio.on('login')
def handle_login(data):
    username = data['username'].strip().lower()
    password = data['password']

    allowed, secs = _check_login_rate(username)
    if not allowed:
        emit('login_result', {'success': False, 'msg': f'登录尝试过多，请 {secs} 秒后重试'})
        return

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM users WHERE LOWER(username) = %s', (username,))
        user = cur.fetchone()
        conn.close()

        if not user:
            emit('login_result', {'success': False, 'msg': '用户名不存在'})
            return
        ok, needs_migrate = verify_password(user['password'], password)
        if not ok:
            _record_login_fail(username)
            emit('login_result', {'success': False, 'msg': '密码错误'})
            return
        _reset_login_attempts(username)
        if user.get('is_admin'):
            _site_admins.add(username)
        else:
            _site_admins.discard(username)
        if needs_migrate:
            conn2 = get_db(); cur2 = conn2.cursor()
            cur2.execute('UPDATE users SET password = %s WHERE username = %s', (hash_password(password), username))
            conn2.commit(); conn2.close()

        emit('login_result', {
            'success': True,
            'username': username,
            'screenname': user['screenname'],
            'bio': user.get('bio') or '',
            'is_admin': is_site_admin(username),
            'avatar_expression': user.get('avatar_expression') or 'Smile',
            'avatar_color': user.get('avatar_color') or '#5865F2',
        })
    except Exception as e:
        emit('login_result', {'success': False, 'msg': str(e)})

# ── 获取用户资料 ──────────────────────────────────────────
@socketio.on('get_profile')
def handle_get_profile(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT screenname, bio, avatar_expression, avatar_color FROM users WHERE username = %s', (data['username'],))
        user = cur.fetchone()
        conn.close()
        if not user:
            emit('profile_result', {'success': False})
            return
        emit('profile_result', {'success': True, 'screenname': user['screenname'], 'bio': user['bio'],
                                 'avatar_expression': user.get('avatar_expression') or 'Smile',
                                 'avatar_color': user.get('avatar_color') or '#5865F2'})
    except Exception as e:
        emit('profile_result', {'success': False})

# ── 修改显示名/简介 ───────────────────────────────────────
@socketio.on('update_profile')
def handle_update_profile(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('UPDATE users SET screenname = %s, bio = %s WHERE username = %s',
                    (data['screenname'].strip(), data['bio'].strip(), data['username']))
        conn.commit()
        conn.close()
        emit('update_profile_result', {'success': True, 'screenname': data['screenname'].strip(), 'bio': data['bio'].strip()})
    except Exception as e:
        emit('update_profile_result', {'success': False, 'msg': str(e)})

# ── 修改密码 ──────────────────────────────────────────────
@socketio.on('change_password')
def handle_change_password(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT password FROM users WHERE username = %s', (data['username'],))
        user = cur.fetchone()
        ok, _ = verify_password(user['password'], data['old_password'])
        if not ok:
            emit('change_password_result', {'success': False, 'msg': '旧密码错误'})
            conn.close()
            return
        if len(data['new_password']) < 6:
            emit('change_password_result', {'success': False, 'msg': '新密码至少6位'})
            conn.close()
            return
        cur.execute('UPDATE users SET password = %s WHERE username = %s',
                    (hash_password(data['new_password']), data['username']))
        conn.commit()
        conn.close()
        emit('change_password_result', {'success': True})
    except Exception as e:
        emit('change_password_result', {'success': False, 'msg': str(e)})

# ── 忘记密码：获取安全问题 ────────────────────────────────
@socketio.on('get_security_question')
def handle_get_security_question(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT security_question FROM users WHERE username = %s', (data['username'].strip(),))
        user = cur.fetchone()
        conn.close()
        if not user:
            emit('security_question_result', {'success': False, 'msg': '用户名不存在'})
            return
        emit('security_question_result', {'success': True, 'question': user['security_question']})
    except Exception as e:
        emit('security_question_result', {'success': False, 'msg': str(e)})

# ── 忘记密码：验证答案并重置 ──────────────────────────────
@socketio.on('reset_password')
def handle_reset_password(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT security_answer FROM users WHERE username = %s', (data['username'].strip(),))
        user = cur.fetchone()
        if user['security_answer'] != data['answer'].strip().lower():
            emit('reset_password_result', {'success': False, 'msg': '答案错误'})
            conn.close()
            return
        if len(data['new_password']) < 6:
            emit('reset_password_result', {'success': False, 'msg': '新密码至少6位'})
            conn.close()
            return
        cur.execute('UPDATE users SET password = %s WHERE username = %s',
                    (hash_password(data['new_password']), data['username']))
        conn.commit()
        conn.close()
        emit('reset_password_result', {'success': True})
    except Exception as e:
        emit('reset_password_result', {'success': False, 'msg': str(e)})

# ── 超级管理员重置密码 ────────────────────────────────────
@socketio.on('admin_reset_password')
def handle_admin_reset(data):
    if not is_site_admin(data['requester']):
        emit('admin_reset_result', {'success': False, 'msg': '无权限'})
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT username FROM users WHERE username = %s', (data['target_username'].strip(),))
        if not cur.fetchone():
            emit('admin_reset_result', {'success': False, 'msg': '用户不存在'})
            conn.close()
            return
        cur.execute('UPDATE users SET password = %s WHERE username = %s',
                    (hash_password(DEFAULT_PASSWORD), data['target_username'].strip()))
        conn.commit()
        conn.close()
        emit('admin_reset_result', {'success': True, 'msg': f"{data['target_username']} 的密码已重置为 {DEFAULT_PASSWORD}"})
    except Exception as e:
        emit('admin_reset_result', {'success': False, 'msg': str(e)})

# ── 获取安全问题列表 ──────────────────────────────────────
@socketio.on('get_questions_list')
def handle_get_questions():
    emit('questions_list', {'questions': SECURITY_QUESTIONS})

# ── 房间：创建 ────────────────────────────────────────────
@socketio.on('create_room')
def handle_create_room(data):
    username = data['username']
    room = data['room'].strip()
    password = data.get('password', '').strip() or None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT name FROM rooms WHERE name = %s', (room,))
        if cur.fetchone():
            emit('create_room_result', {'success': False, 'msg': '房间已存在'})
            conn.close()
            return
        code = _gen_unique_room_code(cur)
        cur.execute('INSERT INTO rooms (name, admins, members, password, owner, code) VALUES (%s, %s, %s, %s, %s, %s)',
                    (room, [], [], password, username, code))
        conn.commit()
        conn.close()
        emit('create_room_result', {'success': True, 'room': room, 'has_password': bool(password), 'code': code})
        socketio.emit('new_room_created', {'room': room, 'has_password': bool(password)})
    except Exception as e:
        emit('create_room_result', {'success': False, 'msg': str(e)})
        

# ── 房间：加入 ────────────────────────────────────────────
@socketio.on('join')
def handle_join(data):
    username = data['username']
    room = data['room'].strip()
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
        room_data = cur.fetchone()
        if not room_data:
            emit('join_result', {'success': False, 'msg': '房间不存在'})
            conn.close()
            return

        kicked = list(room_data.get('kicked') or [])
        if username in kicked and not is_site_admin(username):
            emit('join_result', {'success': False, 'msg': '你已被踢出该房间'})
            conn.close()
            return

        room_pw = room_data.get('password')
        if room_pw and not is_site_admin(username):
            invited = username in pending_invites.get(room, set())
            if invited:
                pending_invites[room].discard(username)
            elif data.get('password', '') != room_pw:
                emit('join_result', {'success': False, 'msg': '密码错误', 'wrong_password': True})
                conn.close()
                return

        join_room(room)
        members = list(room_data['members'] or [])
        is_first_join = username not in members and not is_site_admin(username)
        if is_first_join:
            members.append(username)
            cur.execute('UPDATE rooms SET members = %s WHERE name = %s', (members, room))
            conn.commit()

        owner = room_data.get('owner') or ''
        admins_set = set(room_data['admins'] or [])
        my_level = get_level(username, room_data)
        is_owner = (username == owner)
        is_admin = username in admins_set

        # 成员列表（批量查 screenname）
        member_usernames = list(room_data['members'] or [])
        if member_usernames:
            cur.execute('SELECT username, screenname, avatar_expression, avatar_color FROM users WHERE username = ANY(%s)', (member_usernames,))
            user_rows = {r['username']: r for r in cur.fetchall()}
        else:
            user_rows = {}
        members_data = []
        for u in member_usernames:
            if is_site_admin(u):
                continue
            row = user_rows.get(u, {})
            members_data.append({
                'username': u,
                'screenname': row.get('screenname', u),
                'is_admin': u in admins_set,
                'is_owner': u == owner,
                'is_online': u in online_users,
                'avatar_expression': row.get('avatar_expression') or 'Smile',
                'avatar_color': row.get('avatar_color') or '#5865F2',
            })
        members_data.sort(key=lambda m: (0 if m['is_online'] else 1, m['screenname']))

        room_code = room_data.get('code') or ''

        # 历史消息（先发，join_result 用作"历史结束"信号）
        skip_history = data.get('skip_history', False)
        since = data.get('since')
        if not skip_history:
            if since:
                cur.execute(
                    'SELECT * FROM messages WHERE room = %s AND created_at > %s ORDER BY created_at ASC LIMIT 50',
                    (room, since)
                )
                history = cur.fetchall()
            else:
                cur.execute('SELECT * FROM messages WHERE room = %s ORDER BY created_at DESC LIMIT 50', (room,))
                history = list(reversed(cur.fetchall()))
            for msg in history:
                emit('message', {
                    'id': msg['id'],
                    'username': msg['username'],
                    'screenname': msg['screenname'],
                    'text': msg['text'],
                    'time': msg['created_at'].isoformat() if msg.get('created_at') else msg['time'],
                    'room': room,
                    'recalled': bool(msg.get('recalled')),
                    'edited': bool(msg.get('edited')),
                    'reactions': dict(msg.get('reactions') or {}),
                    'system': bool(msg.get('system')),
                    'meta': dict(msg['meta']) if msg.get('meta') else None,
                })
        conn.close()

        emit('join_result', {'success': True, 'room': room, 'is_owner': is_owner, 'is_admin': is_admin, 'my_level': my_level, 'members': members_data, 'code': room_code, 'is_first_join': is_first_join})

        # 广播成员列表更新给房间内所有人
        emit('members_list', {'room': room, 'members': members_data}, to=room)
        # 仅首次加入才发系统消息（站点管理员静默加入）
        if is_first_join and not is_site_admin(username):
            joiner_screen = (user_rows.get(username) or {}).get('screenname') or username
            emit_system_msg(room, f'{joiner_screen} 加入了房间')

        if room in rooms_voice and rooms_voice[room].get('voice_members'):
            emit('voice_members_view', {
                'members': rooms_voice[room]['voice_members'],
                'banned': list(rooms_voice[room].get('voice_banned', {}).keys())
            })

        for uname, sname in rooms_stream.get(room, {}).items():
            emit('stream_start', {'username': uname, 'screenname': sname, 'room': room})

    except Exception as e:
        emit('join_result', {'success': False, 'msg': str(e)})

# ── 房间：发消息 ──────────────────────────────────────────
@socketio.on('message')
def handle_message(data):
    if not data.get('system'):
        if not _check_msg_rate(data.get('username', '')):
            emit('message_rate_limited', {})
            return
        username = data.get('username', '')
        room_muted = rooms_text_muted.get(data.get('room', ''), {})
        if username in room_muted:
            expiry = room_muted[username]
            if expiry is None or expiry > time.time():
                emit('text_muted_notify', {})
                return
            else:
                del room_muted[username]
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time) VALUES (%s, %s, %s, %s, %s) RETURNING id',
                (data['room'], data['username'], data['screenname'], data['text'],
                 datetime.now().strftime('%H:%M'))
            )
            data['id'] = cur.fetchone()['id']
            conn.commit()
            conn.close()
            data['time'] = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            print('消息保存失败:', e)
    emit('message', data, to=data['room'])
    # DM：通知对方（让其显示侧栏条目），并推送给离线用户
    room = data.get('room', '')
    if not data.get('system') and room.startswith('dm:'):
        parts = room.split(':')
        if len(parts) == 3:
            sender = data['username']
            sender_screen = data.get('screenname', sender)
            recipient = parts[2] if parts[1] == sender else parts[1]
            if recipient in online_users:
                for sid in list(online_users[recipient]):
                    socketio.emit('new_dm_notification', {
                        'dm_room': room,
                        'from_username': sender,
                        'from_screenname': sender_screen,
                    }, to=sid)
            else:
                # Recipient is offline — send push if they have a token
                tokens = push_tokens.get(recipient, [])
                if tokens:
                    _send_push(tokens, sender_screen, data.get('text', '')[:100], {'room': room})
    elif not data.get('system') and room:
        # Group room message: push to room members who are offline
        sender = data.get('username', '')
        sender_screen = data.get('screenname', sender)
        text = data.get('text', '')[:100]
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute('SELECT members FROM rooms WHERE name = %s', (room,))
            row = cur.fetchone()
            conn.close()
            if row:
                for member in (row['members'] or []):
                    if member != sender and member not in online_users:
                        tokens = push_tokens.get(member, [])
                        if tokens:
                            _send_push(tokens, f'{sender_screen} in {room}', text, {'room': room})
        except Exception:
            pass

# ── 消息：撤回 ───────────────────────────────────────────
@socketio.on('recall_message')
def handle_recall_message(data):
    msg_id = data.get('id')
    username = data.get('username')
    room = data.get('room')
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT username, recalled FROM messages WHERE id = %s', (msg_id,))
        msg = cur.fetchone()
        if not msg or msg['recalled']:
            conn.close()
            return
        if msg['username'] != username:
            cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
            room_data = cur.fetchone()
            if not room_data or get_level(username, room_data) < 1:
                conn.close()
                return
        cur.execute('UPDATE messages SET recalled = true WHERE id = %s', (msg_id,))
        conn.commit()
        conn.close()
        emit('message_recalled', {'id': msg_id, 'room': room}, to=room)
    except Exception as e:
        print('撤回失败:', e)

# ── 消息：编辑 ───────────────────────────────────────────
@socketio.on('edit_message')
def handle_edit_message(data):
    msg_id = data.get('id')
    username = data.get('username')
    new_text = (data.get('text') or '').strip()
    room = data.get('room')
    if not new_text:
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT username, recalled FROM messages WHERE id = %s', (msg_id,))
        msg = cur.fetchone()
        if not msg or msg['recalled'] or msg['username'] != username:
            conn.close()
            return
        cur.execute('UPDATE messages SET text = %s, edited = true WHERE id = %s', (new_text, msg_id))
        conn.commit()
        conn.close()
        emit('message_edited', {'id': msg_id, 'text': new_text, 'room': room}, to=room)
    except Exception as e:
        print('编辑失败:', e)

# ── 消息：emoji 反应 ──────────────────────────────────────
@socketio.on('add_reaction')
def handle_add_reaction(data):
    import json as _json
    msg_id = data.get('id')
    username = data.get('username')
    emoji = data.get('emoji', '').strip()
    room = data.get('room')
    if not all([msg_id, username, emoji, room]):
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT reactions, recalled FROM messages WHERE id = %s', (msg_id,))
        msg = cur.fetchone()
        if not msg or msg['recalled']:
            conn.close()
            return
        reactions = dict(msg.get('reactions') or {})
        users = list(reactions.get(emoji, []))
        if username in users:
            users.remove(username)
        else:
            users.append(username)
        if users:
            reactions[emoji] = users
        else:
            reactions.pop(emoji, None)
        cur.execute('UPDATE messages SET reactions = %s WHERE id = %s', (_json.dumps(reactions), msg_id))
        conn.commit()
        conn.close()
        emit('reaction_updated', {'id': msg_id, 'reactions': reactions, 'room': room}, to=room)
    except Exception as e:
        print('反应失败:', e)

# ── 房间：设置管理员 ──────────────────────────────────────
@socketio.on('set_admin')
def handle_set_admin(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        if not room_data:
            emit('set_admin_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        req_level = get_level(data['requester'], room_data)
        tgt_level = get_level(data['target'], room_data)
        remove = data.get('remove', False)
        # 设/取消管理员需要房主级别(2)以上；目标不能是房主或更高级别
        if req_level < 2 or tgt_level >= 2:
            emit('set_admin_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        if data['target'] not in (room_data['members'] or []):
            emit('set_admin_result', {'success': False, 'msg': '该用户不在房间内'})
            conn.close()
            return
        admins = list(room_data['admins'] or [])
        if remove:
            if data['target'] in admins:
                admins.remove(data['target'])
                cur.execute('UPDATE rooms SET admins = %s WHERE name = %s', (admins, data['room']))
                conn.commit()
        else:
            if data['target'] not in admins:
                admins.append(data['target'])
                cur.execute('UPDATE rooms SET admins = %s WHERE name = %s', (admins, data['room']))
                conn.commit()
        conn.close()
        action_text = f"{data['target']} 被取消了管理员" if remove else f"{data['target']} 成为了管理员"
        emit('set_admin_result', {'success': True, 'target': data['target'], 'remove': remove})
        emit_system_msg(data['room'], action_text)
    except Exception as e:
        emit('set_admin_result', {'success': False, 'msg': str(e)})

# ── 房间：设置密码 ────────────────────────────────────────
@socketio.on('set_room_password')
def handle_set_room_password(data):
    room = data['room']
    requester = data['requester']
    password = data.get('password') or None
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
        row = cur.fetchone()
        if not row or get_level(requester, row) < 2:
            emit('set_room_password_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        cur.execute('UPDATE rooms SET password = %s WHERE name = %s', (password, room))
        conn.commit()
        conn.close()
        emit('set_room_password_result', {'success': True})
        socketio.emit('room_password_changed', {'room': room, 'has_password': bool(password)})
    except Exception as e:
        emit('set_room_password_result', {'success': False, 'msg': str(e)})

# ── 房间：关闭房间 ────────────────────────────────────────
@socketio.on('close_room')
def handle_close_room(data):
    if data['room'] == '大厅':
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        if not room_data or get_level(data['requester'], room_data) < 2:
            emit('close_room_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        emit('message', {'screenname': '系统', 'text': '房间已被管理员关闭', 'system': True}, to=data['room'])
        emit('room_closed', {}, to=data['room'])
        cur.execute('DELETE FROM rooms WHERE name = %s', (data['room'],))
        cur.execute('DELETE FROM messages WHERE room = %s', (data['room'],))
        conn.commit()
        conn.close()
    except Exception as e:
        print('关闭房间失败:', e)

# ── 房间：获取列表 ────────────────────────────────────────
@socketio.on('get_rooms')
def handle_get_rooms(data=None):
    username = (data or {}).get('username', '')
    try:
        conn = get_db()
        cur = conn.cursor()
        if is_site_admin(username):
            cur.execute("SELECT name, password, code FROM rooms")
        elif username:
            cur.execute("SELECT name, password, code FROM rooms WHERE name = '大厅' OR %s = ANY(members)", (username,))
        else:
            cur.execute("SELECT name, password, code FROM rooms WHERE name = '大厅'")
        rooms = [{'name': r['name'], 'has_password': bool(r['password']), 'code': r.get('code') or ''} for r in cur.fetchall()]
        conn.close()
        lobby = next((r for r in rooms if r['name'] == '大厅'), None)
        if lobby:
            rooms.remove(lobby)
            rooms.insert(0, lobby)
        emit('rooms_list', {'rooms': rooms})
    except Exception as e:
        emit('rooms_list', {'rooms': []})

@socketio.on('leave_room')
def handle_leave_room(data):
    username = data['username']
    room = data['room'].strip()
    if room == '大厅':
        emit('leave_room_result', {'success': False, 'msg': '无法退出大厅'})
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT members, admins FROM rooms WHERE name = %s', (room,))
        room_data = cur.fetchone()
        if not room_data:
            emit('leave_room_result', {'success': False, 'msg': '房间不存在'})
            conn.close()
            return
        members = list(room_data['members'] or [])
        admins = list(room_data['admins'] or [])
        changed = False
        if username in members:
            members.remove(username)
            cur.execute('UPDATE rooms SET members = %s WHERE name = %s', (members, room))
            changed = True
        if username in admins:
            admins.remove(username)
            cur.execute('UPDATE rooms SET admins = %s WHERE name = %s', (admins, room))
            changed = True
        if changed:
            conn.commit()
        conn.close()
        leaver_screen = username
        try:
            sc = get_db(); scc = sc.cursor()
            scc.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = scc.fetchone(); sc.close()
            if row: leaver_screen = row['screenname']
        except Exception: pass
        emit('leave_room_result', {'success': True, 'room': room})
        emit_system_msg(room, f'{leaver_screen} 离开了房间')
    except Exception as e:
        emit('leave_room_result', {'success': False, 'msg': str(e)})

@socketio.on('invite_to_room')
def handle_invite_to_room(data):
    """给目标用户发一条携带邀请信息的 DM 消息。"""
    inviter = data['inviter']
    inviter_screen = data.get('inviter_screen', inviter)
    target = data['target']
    room = data['room']
    try:
        conn = get_db()
        cur = conn.cursor()
        # 取房间 code 供免密邀请跳转
        cur.execute('SELECT code FROM rooms WHERE name = %s', (room,))
        row = cur.fetchone()
        room_code = row['code'] if row else ''
        # 确保 DM 房间存在
        dm_room = 'dm:' + ':'.join(sorted([inviter, target]))
        cur.execute('SELECT 1 FROM messages WHERE room = %s LIMIT 1', (dm_room,))
        # 写入邀请消息
        meta = json.dumps({'invite': {'room': room, 'code': room_code}})
        text = f'{inviter_screen} 邀请你加入房间 {room}'
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text, time, meta) VALUES (%s, %s, %s, %s, %s, %s::jsonb) RETURNING id',
            (dm_room, inviter, inviter_screen, text, datetime.now().strftime('%H:%M'), meta)
        )
        msg_id = cur.fetchone()['id']
        conn.commit()
        conn.close()
        msg_data = {
            'id': msg_id,
            'username': inviter,
            'screenname': inviter_screen,
            'text': text,
            'time': datetime.now(timezone.utc).isoformat(),
            'room': dm_room,
            'meta': {'invite': {'room': room, 'code': room_code}},
        }
        # 推给双方在线的所有 session
        for u in [inviter, target]:
            for sid in list(online_users.get(u, [])):
                socketio.emit('message', msg_data, to=sid)
        emit('invite_sent', {'success': True})
    except Exception as e:
        print('邀请失败:', e)
        emit('invite_sent', {'success': False, 'msg': str(e)})

@socketio.on('room_subscribe')
def handle_room_subscribe(data):
    """只订阅房间消息流，不加载历史，不更新成员列表。"""
    join_room(data['room'])

@socketio.on('stream_audio_start')
def handle_stream_audio_start(data):
    room = data.get('room')
    if room:
        emit('stream_audio_start', data, to=room, include_self=False)

@socketio.on('stream_audio_stop')
def handle_stream_audio_stop(data):
    room = data.get('room')
    if room:
        emit('stream_audio_stop', data, to=room, include_self=False)

@socketio.on('stream_start')
def handle_stream_start(data):
    room = data.get('room')
    if room:
        rooms_stream.setdefault(room, {})[data['username']] = data.get('screenname', data['username'])
        emit('stream_start', data, to=room, include_self=False)

@socketio.on('stream_stop')
def handle_stream_stop(data):
    room = data.get('room')
    if room:
        rooms_stream.get(room, {}).pop(data.get('username'), None)
        emit('stream_stop', data, to=room, include_self=False)

@socketio.on('find_room')
def handle_find_room(data):
    code = data.get('code', '').strip()
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT name, password, code FROM rooms WHERE code = %s', (code,))
        room = cur.fetchone()
        conn.close()
        if not room:
            emit('find_room_result', {'success': False, 'msg': '找不到该房间号'})
            return
        emit('find_room_result', {'success': True, 'room': room['name'], 'has_password': bool(room['password']), 'code': room['code']})
    except Exception as e:
        emit('find_room_result', {'success': False, 'msg': str(e)})

@socketio.on('get_my_admin_rooms')
def handle_get_my_admin_rooms(data):
    username = data.get('username', '')
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name, code FROM rooms WHERE owner = %s OR %s = ANY(admins)", (username, username))
        rooms = [{'name': r['name'], 'code': r.get('code') or ''} for r in cur.fetchall()]
        conn.close()
        emit('my_admin_rooms', {'rooms': rooms})
    except Exception as e:
        emit('my_admin_rooms', {'rooms': []})

@socketio.on('invite_to_room')
def handle_invite_to_room(data):
    requester = data.get('requester', '')
    target = data.get('target', '')
    room = data.get('room', '')
    if not requester or not target or not room:
        return
    pending_invites.setdefault(room, set()).add(target)
    if target in online_users:
        for sid in list(online_users[target]):
            socketio.emit('room_invite', {'from': requester, 'room': room}, to=sid)

# ── 房间：获取成员 ────────────────────────────────────────
@socketio.on('get_members')
def handle_get_members(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        if not room_data:
            emit('members_list', {'members': []})
            conn.close()
            return
        owner = room_data.get('owner') or ''
        admins_set = set(room_data['admins'] or [])
        member_usernames = list(room_data['members'] or [])
        if member_usernames:
            cur.execute('SELECT username, screenname, avatar_expression, avatar_color FROM users WHERE username = ANY(%s)', (member_usernames,))
            user_rows2 = {r['username']: r for r in cur.fetchall()}
        else:
            user_rows2 = {}
        members = []
        for username in member_usernames:
            if is_site_admin(username):
                continue
            row = user_rows2.get(username, {})
            members.append({
                'username': username,
                'screenname': row.get('screenname', username),
                'is_admin': username in admins_set,
                'is_owner': username == owner,
                'is_online': username in online_users,
                'avatar_expression': row.get('avatar_expression') or 'Smile',
                'avatar_color': row.get('avatar_color') or '#5865F2',
            })
        members.sort(key=lambda m: (0 if m['is_online'] else 1, m['screenname']))
        conn.close()
        emit('members_list', {'members': members})
    except Exception as e:
        emit('members_list', {'members': []})

# ── 踢出房间 ──────────────────────────────────────────────
@socketio.on('kick_member')
def handle_kick_member(data):
    requester = data['requester']
    target = data['target']
    room = data['room']
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room,))
        room_data = cur.fetchone()
        if not room_data:
            conn.close()
            return
        req_level = get_level(requester, room_data)
        tgt_level = get_level(target, room_data)
        if req_level < 1 or req_level <= tgt_level:
            emit('kick_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        members = list(room_data['members'] or [])
        if target in members:
            members.remove(target)
        kicked = list(room_data.get('kicked') or [])
        if target not in kicked:
            kicked.append(target)
        cur.execute('UPDATE rooms SET members = %s, kicked = %s WHERE name = %s', (members, kicked, room))
        conn.commit()
        cur.execute('SELECT screenname FROM users WHERE username = %s', (target,))
        target_user = cur.fetchone()
        conn.close()
        target_screen = target_user['screenname'] if target_user else target
        if target in online_users:
            for sid in list(online_users[target]):
                socketio.emit('kicked_from_room', {'room': room}, to=sid)
        emit_system_msg(room, f'{target_screen} 被踢出了房间')
        emit('kick_result', {'success': True})
    except Exception as e:
        emit('kick_result', {'success': False, 'msg': str(e)})

# ── 语音信令 ──────────────────────────────────────────────
@socketio.on('save_avatar')
def handle_save_avatar(data):
    username = data.get('username', '')
    expression = data.get('expression', 'Smile')
    color = data.get('color', '#5865F2')
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('UPDATE users SET avatar_expression = %s, avatar_color = %s WHERE username = %s',
                    (expression, color, username))
        conn.commit()
        conn.close()
        emit('save_avatar_result', {'success': True, 'expression': expression, 'color': color})
    except Exception as e:
        emit('save_avatar_result', {'success': False, 'msg': str(e)})

@socketio.on('voice_join')
def handle_voice_join(data):
    username = data['username']
    screenname = data.get('screenname', username)
    room = data['room']
    avatar_expression = data.get('avatar_expression', 'Smile')
    avatar_color = data.get('avatar_color', '#5865F2')
    if room not in rooms_voice:
        rooms_voice[room] = {'voice_members': [], 'voice_banned': {}}
    banned = rooms_voice[room]['voice_banned']
    if username in banned:
        expiry = banned[username]
        if expiry is None or expiry > time.time():
            emit('voice_banned', {'target': username})
            return
        else:
            del banned[username]  # 已过期，自动解除
    if not any(m['username'] == username for m in rooms_voice[room]['voice_members']):
        rooms_voice[room]['voice_members'].append({
            'username': username, 'screenname': screenname,
            'avatar_expression': avatar_expression, 'avatar_color': avatar_color
        })
    sid_to_voice[request.sid] = (username, room)
    emit('voice_user_joined', {
        'username': username, 'screenname': screenname,
        'avatar_expression': avatar_expression, 'avatar_color': avatar_color,
        'room': room,
    }, to=room)
    emit('voice_current_members', {'members': rooms_voice[room]['voice_members']})

@socketio.on('voice_leave')
def handle_voice_leave(data):
    username = data['username']
    room = data['room']
    if room in rooms_voice:
        rooms_voice[room]['voice_members'] = [m for m in rooms_voice[room]['voice_members'] if m['username'] != username]
    sid_to_voice.pop(request.sid, None)
    emit('voice_user_left', {'username': username, 'room': room}, to=room)

@socketio.on('voice_offer')
def handle_voice_offer(data):
    emit('voice_offer', data, to=data['room'])

@socketio.on('voice_answer')
def handle_voice_answer(data):
    emit('voice_answer', data, to=data['room'])

@socketio.on('voice_ice')
def handle_voice_ice(data):
    emit('voice_ice', data, to=data['room'])

@socketio.on('voice_mute_status')
def handle_voice_mute(data):
    emit('voice_mute_status', data, to=data['room'])

@socketio.on('text_mute')
def handle_text_mute(data):
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone(); conn.close()
        req_level = get_level(data['username'], room_data)
        tgt_level = get_level(data['target'], room_data)
        if req_level < 1 or req_level <= tgt_level:
            return
    except:
        return
    room = data['room']
    target = data['target']
    duration = int(data.get('duration_seconds', 0))
    if room not in rooms_text_muted:
        rooms_text_muted[room] = {}
    expiry = None if duration == 0 else time.time() + duration
    rooms_text_muted[room][target] = expiry
    emit('text_muted', {'target': target, 'duration': duration}, to=room)
    if duration > 0:
        def auto_unmute(r=room, t=target, e=expiry):
            socketio.sleep(duration)
            if r in rooms_text_muted and rooms_text_muted[r].get(t) == e:
                del rooms_text_muted[r][t]
                socketio.emit('text_unmuted', {'target': t}, to=r)
        socketio.start_background_task(auto_unmute)

@socketio.on('text_unmute')
def handle_text_unmute(data):
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone(); conn.close()
        req_level = get_level(data['username'], room_data) if room_data else 0
        tgt_level = get_level(data['target'], room_data) if room_data else 0
        if not room_data or req_level < 1 or req_level <= tgt_level:
            return
    except:
        return
    room = data['room']
    if room in rooms_text_muted:
        rooms_text_muted[room].pop(data['target'], None)
    emit('text_unmuted', {'target': data['target']}, to=room)

@socketio.on('voice_ban')
def handle_voice_ban(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        conn.close()
        req_level = get_level(data['username'], room_data)
        tgt_level = get_level(data['target'], room_data)
        if req_level < 1 or req_level <= tgt_level:
            return
    except:
        return
    room = data['room']
    target = data['target']
    duration = int(data.get('duration_seconds', 0))  # 0 = 永久
    if room not in rooms_voice:
        rooms_voice[room] = {'voice_members': [], 'voice_banned': {}}
    expiry = None if duration == 0 else time.time() + duration
    rooms_voice[room]['voice_banned'][target] = expiry
    emit('voice_banned', {'target': target}, to=room)
    if duration > 0:
        def auto_unban(r=room, t=target, e=expiry):
            socketio.sleep(duration)
            if r in rooms_voice and rooms_voice[r]['voice_banned'].get(t) == e:
                del rooms_voice[r]['voice_banned'][t]
                socketio.emit('voice_unbanned', {'target': t}, to=r)
        socketio.start_background_task(auto_unban)

@socketio.on('voice_unban')
def handle_voice_unban(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        conn.close()
        req_level = get_level(data['username'], room_data) if room_data else 0
        tgt_level = get_level(data['target'], room_data) if room_data else 0
        if not room_data or req_level < 1 or req_level <= tgt_level:
            return
    except:
        return
    room = data['room']
    if room in rooms_voice:
        rooms_voice[room]['voice_banned'].pop(data['target'], None)
    emit('voice_unbanned', {'target': data['target']}, to=room)

@socketio.on('voice_speaking')
def handle_voice_speaking(data):
    emit('voice_speaking', data, to=data['room'])

@socketio.on('ping_check')
def handle_ping_check(data):
    emit('pong_check', data)

# ── 私聊 (DM) ────────────────────────────────────────────
@socketio.on('get_dms')
def handle_get_dms(data):
    username = data.get('username', '')
    if not username:
        emit('dms_list', {'dms': []})
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT DISTINCT room FROM messages WHERE room LIKE 'dm:%%:%%' AND (room LIKE %s OR room LIKE %s)",
            (f'dm:{username}:%', f'dm:%:{username}')
        )
        dm_rooms = [r['room'] for r in cur.fetchall()]
        dms = []
        for dm_room in dm_rooms:
            parts = dm_room.split(':')
            if len(parts) != 3:
                continue
            other = parts[2] if parts[1] == username else parts[1]
            cur.execute('SELECT screenname, avatar_expression, avatar_color FROM users WHERE username = %s', (other,))
            other_user = cur.fetchone()
            if other_user:
                dms.append({
                    'dm_room': dm_room,
                    'other_username': other,
                    'other_screenname': other_user['screenname'],
                    'avatar_expression': other_user.get('avatar_expression') or 'Smile',
                    'avatar_color': other_user.get('avatar_color') or '#5865F2',
                })
            join_room(dm_room)
        conn.close()
        emit('dms_list', {'dms': dms})
    except Exception as e:
        print('get_dms error:', e)
        emit('dms_list', {'dms': []})

@socketio.on('join_dm')
def handle_join_dm(data):
    username = data['username']
    dm_room = data['dm_room']
    parts = dm_room.split(':')
    if len(parts) != 3 or parts[0] != 'dm' or username not in [parts[1], parts[2]]:
        emit('join_dm_result', {'success': False})
        return
    join_room(dm_room)
    try:
        conn = get_db()
        cur = conn.cursor()
        since = data.get('since')
        if since:
            cur.execute(
                'SELECT * FROM messages WHERE room = %s AND created_at > %s ORDER BY created_at ASC LIMIT 50',
                (dm_room, since)
            )
            history = cur.fetchall()
        else:
            cur.execute('SELECT * FROM messages WHERE room = %s ORDER BY created_at DESC LIMIT 50', (dm_room,))
            history = list(reversed(cur.fetchall()))
        conn.close()
        for msg in history:
            emit('message', {
                'id': msg['id'],
                'username': msg['username'],
                'screenname': msg['screenname'],
                'text': msg['text'],
                'time': msg['created_at'].isoformat() if msg.get('created_at') else msg['time'],
                'room': dm_room,
                'recalled': bool(msg.get('recalled')),
                'edited': bool(msg.get('edited')),
                'reactions': dict(msg.get('reactions') or {}),
                'meta': dict(msg['meta']) if msg.get('meta') else None,
            })
    except Exception as e:
        print('join_dm history error:', e)
    emit('join_dm_result', {'success': True, 'dm_room': dm_room})

# ── 推送通知 ──────────────────────────────────────────────
@socketio.on('register_push_token')
def handle_register_push_token(data):
    username = data.get('username', '')
    token = data.get('token', '')
    if not username or not token:
        return
    tokens = push_tokens.setdefault(username, [])
    if token not in tokens:
        tokens.append(token)

def _send_push(tokens, title, body, data=None):
    """Fire-and-forget: send Expo push notifications to a list of tokens."""
    if not tokens:
        return
    import threading
    import urllib.request as _req

    def _worker():
        try:
            payload = json.dumps([
                {'to': t, 'title': title, 'body': body, 'data': data or {}, 'sound': 'default'}
                for t in tokens
            ]).encode('utf-8')
            req = _req.Request(
                'https://exp.host/--/api/v2/push/send',
                data=payload,
                headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
                method='POST',
            )
            _req.urlopen(req, timeout=5)
        except Exception as e:
            print('push error:', e)

    threading.Thread(target=_worker, daemon=True).start()

# ── 账号注销 ──────────────────────────────────────────────
@socketio.on('delete_account')
def handle_delete_account(data):
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')
    if not username or not password:
        emit('delete_account_result', {'success': False, 'msg': '参数缺失'})
        return
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('SELECT password FROM users WHERE username = %s', (username,))
        row = cur.fetchone()
        if not row:
            emit('delete_account_result', {'success': False, 'msg': '用户不存在'})
            conn.close(); return
        ok, _ = verify_password(row['password'], password, username)
        if not ok:
            emit('delete_account_result', {'success': False, 'msg': '密码错误'})
            conn.close(); return
        cur.execute('UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s)', (username, username))
        cur.execute('DELETE FROM blocks WHERE blocker = %s OR blocked = %s', (username, username))
        cur.execute('DELETE FROM users WHERE username = %s', (username,))
        conn.commit(); conn.close()
        emit('delete_account_result', {'success': True})
    except Exception as e:
        emit('delete_account_result', {'success': False, 'msg': str(e)})

# ── 举报 ──────────────────────────────────────────────────
@socketio.on('report_user')
def handle_report_user(data):
    reporter = data.get('reporter', '')
    reported = data.get('reported', '')
    reason = data.get('reason', '').strip()
    if not reporter or not reported or reporter == reported:
        return
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('INSERT INTO reports (reporter, reported, reason) VALUES (%s, %s, %s)', (reporter, reported, reason))
        conn.commit(); conn.close()
        emit('report_result', {'success': True})
    except Exception as e:
        emit('report_result', {'success': False, 'msg': str(e)})

@socketio.on('get_reports')
def handle_get_reports(data):
    requester = data.get('username', '')
    if not is_site_admin(requester):
        return
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('SELECT id, reporter, reported, reason, created_at FROM reports ORDER BY created_at DESC LIMIT 200')
        rows = cur.fetchall(); conn.close()
        emit('reports_list', {'reports': [dict(r) for r in rows]})
    except Exception as e:
        emit('reports_list', {'reports': []})

# ── 屏蔽 ──────────────────────────────────────────────────
@socketio.on('block_user')
def handle_block_user(data):
    blocker = data.get('blocker', '')
    blocked = data.get('blocked', '')
    if not blocker or not blocked or blocker == blocked:
        return
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('INSERT INTO blocks (blocker, blocked) VALUES (%s, %s) ON CONFLICT DO NOTHING', (blocker, blocked))
        conn.commit(); conn.close()
        emit('block_result', {'success': True, 'blocked': blocked})
    except Exception as e:
        emit('block_result', {'success': False})

@socketio.on('unblock_user')
def handle_unblock_user(data):
    blocker = data.get('blocker', '')
    blocked = data.get('blocked', '')
    if not blocker or not blocked:
        return
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('DELETE FROM blocks WHERE blocker = %s AND blocked = %s', (blocker, blocked))
        conn.commit(); conn.close()
        emit('unblock_result', {'success': True, 'unblocked': blocked})
    except Exception as e:
        emit('unblock_result', {'success': False})

@socketio.on('get_blocked_users')
def handle_get_blocked_users(data):
    username = data.get('username', '')
    if not username:
        return
    try:
        conn = get_db(); cur = conn.cursor()
        cur.execute('SELECT blocked FROM blocks WHERE blocker = %s', (username,))
        rows = cur.fetchall(); conn.close()
        emit('blocked_users_list', {'users': [r['blocked'] for r in rows]})
    except Exception:
        emit('blocked_users_list', {'users': []})

# ── 工具函数 ──────────────────────────────────────────────
def _gen_unique_room_code(cur):
    while True:
        code = ''.join(random.choices(string.digits, k=6))
        cur.execute('SELECT 1 FROM rooms WHERE code = %s', (code,))
        if not cur.fetchone():
            return code

# ── 启动 ──────────────────────────────────────────────────
def ensure_columns():
    """确保 rooms 表拥有所有必要的列，兼容旧版数据库。"""
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password TEXT")
        cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner TEXT")
        cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kicked TEXT[]")
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled BOOLEAN DEFAULT FALSE")
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE")
        cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb")
        # 清除站点管理员账号不应出现在成员列表里
        cur.execute("SELECT username FROM users WHERE is_admin = TRUE")
        for admin_row in cur.fetchall():
            cur.execute(
                "UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s)",
                (admin_row['username'], admin_row['username'])
            )
        conn.commit()
        conn.close()
    except Exception as e:
        print('列迁移失败:', e)

def ensure_room_codes():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS code TEXT")
        conn.commit()
        cur.execute("SELECT name FROM rooms WHERE code IS NULL")
        rows = cur.fetchall()
        for row in rows:
            code = _gen_unique_room_code(cur)
            cur.execute("UPDATE rooms SET code = %s WHERE name = %s", (code, row['name']))
        conn.commit()
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_idx ON rooms(code) WHERE code IS NOT NULL")
        conn.commit()
        conn.close()
    except Exception as e:
        print('房间号迁移失败:', e)

def ensure_avatar_columns():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_expression TEXT")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT")
        conn.commit()
        conn.close()
    except Exception as e:
        print('avatar列迁移失败:', e)

def ensure_reports_blocks():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                reporter TEXT NOT NULL,
                reported TEXT NOT NULL,
                reason TEXT DEFAULT '',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        ''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS blocks (
                blocker TEXT NOT NULL,
                blocked TEXT NOT NULL,
                PRIMARY KEY (blocker, blocked)
            )
        ''')
        conn.commit()
        conn.close()
    except Exception as e:
        print('reports/blocks 表创建失败:', e)

def ensure_lobby():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM rooms WHERE name = '大厅'")
        if not cur.fetchone():
            cur.execute('INSERT INTO rooms (name, admins, members, owner) VALUES (%s, %s, %s, %s)',
                        ('大厅', [], [], 'admin'))
            conn.commit()
        conn.close()
    except Exception as e:
        print('创建大厅失败:', e)

if __name__ == '__main__':
    ensure_columns()
    ensure_room_codes()
    ensure_avatar_columns()
    ensure_reports_blocks()
    ensure_lobby()
    load_site_admins()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
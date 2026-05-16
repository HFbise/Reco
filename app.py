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
from flask import Flask, render_template, session, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2
from psycopg2.extras import RealDictCursor


app = Flask(__name__)
app.config['SECRET_KEY'] = 'reco-secret-2024'
socketio = SocketIO(app, async_mode='threading')

DATABASE_URL = os.environ.get('DATABASE_URL')

SECURITY_QUESTIONS = [
    "你的出生城市是？",
    "你的小学名字是？",
    "你最喜欢的宠物名字是？",
    "你母亲的娘家姓是？",
    "你的第一辆车的品牌是？",
    "你最喜欢的老师叫什么？"
]

SUPER_ADMIN = "admin"
DEFAULT_PASSWORD = "reco1234"

def get_level(username, room_data):
    """返回用户在房间内的权限级别: 3=admin, 2=房主, 1=管理员, 0=普通成员"""
    if username == SUPER_ADMIN:
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
online_users = {}        # { username: set of sids }
sid_to_voice = {}        # { sid: (username, room) } — for cleanup on disconnect
pending_invites = {}     # { room: set(usernames) } — 待接受的邀请，加入时跳过密码验证

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

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
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/sw.js')
def service_worker():
    resp = app.send_static_file('sw.js')
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp

TURN_HOST   = '129.153.163.143'
TURN_PORT   = 3478
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
            emit('login_result', {'success': False, 'msg': '密码错误'})
            return
        if needs_migrate:
            conn2 = get_db(); cur2 = conn2.cursor()
            cur2.execute('UPDATE users SET password = %s WHERE username = %s', (hash_password(password), username))
            conn2.commit(); conn2.close()

        emit('login_result', {
            'success': True,
            'username': username,
            'screenname': user['screenname'],
            'bio': user.get('bio') or '',
            'is_admin': username == SUPER_ADMIN,
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
    if data['requester'] != SUPER_ADMIN:
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
        if username in kicked and username != SUPER_ADMIN:
            emit('join_result', {'success': False, 'msg': '你已被踢出该房间'})
            conn.close()
            return

        room_pw = room_data.get('password')
        if room_pw and username != SUPER_ADMIN:
            invited = username in pending_invites.get(room, set())
            if invited:
                pending_invites[room].discard(username)
            elif data.get('password', '') != room_pw:
                emit('join_result', {'success': False, 'msg': '密码错误', 'wrong_password': True})
                conn.close()
                return

        join_room(room)
        members = list(room_data['members'] or [])
        is_first_join = username not in members and username != SUPER_ADMIN
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
            if u == SUPER_ADMIN:
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
                })
        conn.close()

        emit('join_result', {'success': True, 'room': room, 'is_owner': is_owner, 'is_admin': is_admin, 'my_level': my_level, 'members': members_data, 'code': room_code, 'is_first_join': is_first_join})

        if room in rooms_voice and rooms_voice[room].get('voice_members'):
            emit('voice_members_view', {
                'members': rooms_voice[room]['voice_members'],
                'banned': rooms_voice[room].get('voice_banned', [])
            })

        for uname, sname in rooms_stream.get(room, {}).items():
            emit('stream_start', {'username': uname, 'screenname': sname, 'room': room})

    except Exception as e:
        emit('join_result', {'success': False, 'msg': str(e)})

# ── 房间：发消息 ──────────────────────────────────────────
@socketio.on('message')
def handle_message(data):
    if not data.get('system'):
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
    # DM：通知对方（让其显示侧栏条目）
    room = data.get('room', '')
    if not data.get('system') and room.startswith('dm:'):
        parts = room.split(':')
        if len(parts) == 3:
            sender = data['username']
            recipient = parts[2] if parts[1] == sender else parts[1]
            if recipient in online_users:
                for sid in list(online_users[recipient]):
                    socketio.emit('new_dm_notification', {
                        'dm_room': room,
                        'from_username': sender,
                        'from_screenname': data['screenname'],
                    }, to=sid)

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
        emit('message_recalled', {'id': msg_id}, to=room)
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
        emit('message_edited', {'id': msg_id, 'text': new_text}, to=room)
    except Exception as e:
        print('编辑失败:', e)

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
        emit('message', {'screenname': '系统', 'text': action_text, 'system': True}, to=data['room'])
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
        if username == SUPER_ADMIN:
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
        emit('leave_room_result', {'success': True, 'room': room})
    except Exception as e:
        emit('leave_room_result', {'success': False, 'msg': str(e)})

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
            if username == SUPER_ADMIN:
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
        emit('message', {'screenname': '系统', 'text': f"{target_screen} 被踢出了房间", 'system': True}, to=room)
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
        rooms_voice[room] = {'voice_members': [], 'voice_banned': []}
    if not any(m['username'] == username for m in rooms_voice[room]['voice_members']):
        rooms_voice[room]['voice_members'].append({
            'username': username, 'screenname': screenname,
            'avatar_expression': avatar_expression, 'avatar_color': avatar_color
        })
    sid_to_voice[request.sid] = (username, room)
    emit('voice_user_joined', {
        'username': username, 'screenname': screenname,
        'avatar_expression': avatar_expression, 'avatar_color': avatar_color
    }, to=room)
    emit('voice_current_members', {'members': rooms_voice[room]['voice_members']})

@socketio.on('voice_leave')
def handle_voice_leave(data):
    username = data['username']
    room = data['room']
    if room in rooms_voice:
        rooms_voice[room]['voice_members'] = [m for m in rooms_voice[room]['voice_members'] if m['username'] != username]
    sid_to_voice.pop(request.sid, None)
    emit('voice_user_left', {'username': username}, to=room)

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

@socketio.on('voice_ban')
def handle_voice_ban(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT admins FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        conn.close()
        req_level = get_level(data['requester'], room_data)
        tgt_level = get_level(data['target'], room_data)
        if req_level < 1 or req_level <= tgt_level:
            return
    except:
        return
    room = data['room']
    if room not in rooms_voice:
        rooms_voice[room] = {'voice_members': [], 'voice_banned': []}
    if data['target'] not in rooms_voice[room]['voice_banned']:
        rooms_voice[room]['voice_banned'].append(data['target'])
    emit('voice_banned', {'target': data['target']}, to=room)

@socketio.on('voice_unban')
def handle_voice_unban(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        conn.close()
        req_level = get_level(data['requester'], room_data) if room_data else 0
        tgt_level = get_level(data['target'], room_data) if room_data else 0
        if not room_data or req_level < 1 or req_level <= tgt_level:
            return
    except:
        return
    room = data['room']
    if room in rooms_voice and data['target'] in rooms_voice[room]['voice_banned']:
        rooms_voice[room]['voice_banned'].remove(data['target'])
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
            })
    except Exception as e:
        print('join_dm history error:', e)
    emit('join_dm_result', {'success': True, 'dm_room': dm_room})

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
        # 清除 admin 账号不应出现在成员列表里
        cur.execute(
            "UPDATE rooms SET members = array_remove(members, %s), admins = array_remove(admins, %s)",
            (SUPER_ADMIN, SUPER_ADMIN)
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

def ensure_lobby():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM rooms WHERE name = '大厅'")
        if not cur.fetchone():
            cur.execute('INSERT INTO rooms (name, admins, members, owner) VALUES (%s, %s, %s, %s)',
                        ('大厅', [], [], SUPER_ADMIN))
            conn.commit()
        conn.close()
    except Exception as e:
        print('创建大厅失败:', e)

if __name__ == '__main__':
    ensure_columns()
    ensure_room_codes()
    ensure_avatar_columns()
    ensure_lobby()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
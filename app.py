import os
from dotenv import load_dotenv
load_dotenv()
import json
from datetime import datetime, timezone
from flask import Flask, render_template, session, request
from flask_socketio import SocketIO, emit, join_room, leave_room
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

# ── 内存状态 ─────────────────────────────────────────────
rooms_voice = {}
online_users = {}        # { username: set of sids }
super_admins = {SUPER_ADMIN}  # 超级管理员集合，启动时从 DB 加载

def load_super_admins():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT username FROM users WHERE is_super_admin = TRUE')
        for row in cur.fetchall():
            super_admins.add(row['username'])
        conn.close()
    except Exception as e:
        print('加载超管列表失败:', e)

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

# ── 页面路由 ──────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

# ── 用户注册 ──────────────────────────────────────────────
@socketio.on('register')
def handle_register(data):
    username = data['username'].strip()
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
            (username, screenname, password, bio, security_q, security_a)
        )
        conn.commit()
        conn.close()
        emit('register_result', {'success': True})
    except Exception as e:
        emit('register_result', {'success': False, 'msg': str(e)})

# ── 用户登录 ──────────────────────────────────────────────
@socketio.on('login')
def handle_login(data):
    username = data['username'].strip()
    password = data['password']

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM users WHERE username = %s', (username,))
        user = cur.fetchone()
        conn.close()

        if not user:
            emit('login_result', {'success': False, 'msg': '用户名不存在'})
            return
        if user['password'] != password:
            emit('login_result', {'success': False, 'msg': '密码错误'})
            return

        emit('login_result', {
            'success': True,
            'username': username,
            'screenname': user['screenname'],
            'is_super_admin': username in super_admins
        })
    except Exception as e:
        emit('login_result', {'success': False, 'msg': str(e)})

# ── 获取用户资料 ──────────────────────────────────────────
@socketio.on('get_profile')
def handle_get_profile(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT screenname, bio FROM users WHERE username = %s', (data['username'],))
        user = cur.fetchone()
        conn.close()
        if not user:
            emit('profile_result', {'success': False})
            return
        emit('profile_result', {'success': True, 'screenname': user['screenname'], 'bio': user['bio']})
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
        emit('update_profile_result', {'success': True, 'screenname': data['screenname'].strip()})
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
        if user['password'] != data['old_password']:
            emit('change_password_result', {'success': False, 'msg': '旧密码错误'})
            conn.close()
            return
        if len(data['new_password']) < 6:
            emit('change_password_result', {'success': False, 'msg': '新密码至少6位'})
            conn.close()
            return
        cur.execute('UPDATE users SET password = %s WHERE username = %s',
                    (data['new_password'], data['username']))
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
                    (data['new_password'], data['username']))
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
                    (DEFAULT_PASSWORD, data['target_username'].strip()))
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
        cur.execute('INSERT INTO rooms (name, admins, members, password) VALUES (%s, %s, %s, %s)',
                    (room, [username], [], password))
        conn.commit()
        conn.close()
        emit('create_room_result', {'success': True, 'room': room, 'has_password': bool(password)})
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
        if username in kicked and username not in super_admins:
            emit('join_result', {'success': False, 'msg': '你已被踢出该房间'})
            conn.close()
            return

        room_pw = room_data.get('password')
        if room_pw and username not in super_admins:
            if data.get('password', '') != room_pw:
                emit('join_result', {'success': False, 'msg': '密码错误', 'wrong_password': True})
                conn.close()
                return

        join_room(room)
        members = list(room_data['members'] or [])
        is_first_join = username not in members
        if is_first_join:
            members.append(username)
            cur.execute('UPDATE rooms SET members = %s WHERE name = %s', (members, room))
            conn.commit()

        is_admin = username in (room_data['admins'] or [])
        emit('join_result', {'success': True, 'room': room, 'is_admin': is_admin})

        # 历史消息
        cur.execute('SELECT * FROM messages WHERE room = %s ORDER BY created_at DESC LIMIT 50', (room,))
        history = list(reversed(cur.fetchall()))
        conn.close()
        for msg in history:
            emit('message', {
                'username': msg['username'],
                'screenname': msg['screenname'],
                'text': msg['text'],
                'time': msg['created_at'].isoformat() if msg.get('created_at') else msg['time'],
                'room': room
            })

        if room in rooms_voice and rooms_voice[room].get('voice_members'):
            emit('voice_members_view', {'members': rooms_voice[room]['voice_members']})

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
                'INSERT INTO messages (room, username, screenname, text, time) VALUES (%s, %s, %s, %s, %s)',
                (data['room'], data['username'], data['screenname'], data['text'],
                 datetime.now().strftime('%H:%M'))
            )
            conn.commit()
            conn.close()
            data['time'] = datetime.now(timezone.utc).isoformat()
        except Exception as e:
            print('消息保存失败:', e)
    emit('message', data, to=data['room'])

# ── 房间：设置管理员 ──────────────────────────────────────
@socketio.on('set_admin')
def handle_set_admin(data):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (data['room'],))
        room_data = cur.fetchone()
        if not room_data or data['requester'] not in (room_data['admins'] or []):
            emit('set_admin_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        if data['target'] not in (room_data['members'] or []):
            emit('set_admin_result', {'success': False, 'msg': '该用户不在房间内'})
            conn.close()
            return
        admins = list(room_data['admins'] or [])
        if data['target'] not in admins:
            admins.append(data['target'])
            cur.execute('UPDATE rooms SET admins = %s WHERE name = %s', (admins, data['room']))
            conn.commit()
        conn.close()
        emit('set_admin_result', {'success': True, 'target': data['target']})
        emit('message', {'screenname': '系统', 'text': f"{data['target']} 成为了管理员", 'system': True}, to=data['room'])
    except Exception as e:
        emit('set_admin_result', {'success': False, 'msg': str(e)})

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
        if not room_data or (data['requester'] not in (room_data['admins'] or []) and data['requester'] not in super_admins):
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
def handle_get_rooms():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT name, password FROM rooms')
        rooms = [{'name': r['name'], 'has_password': bool(r['password'])} for r in cur.fetchall()]
        conn.close()
        lobby = next((r for r in rooms if r['name'] == '大厅'), None)
        if lobby:
            rooms.remove(lobby)
            rooms.insert(0, lobby)
        emit('rooms_list', {'rooms': rooms})
    except Exception as e:
        emit('rooms_list', {'rooms': []})

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
        members = []
        for username in (room_data['members'] or []):
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            user = cur.fetchone()
            if user:
                members.append({
                    'username': username,
                    'screenname': user['screenname'],
                    'is_admin': username in (room_data['admins'] or []),
                    'is_online': username in online_users,
                    'is_super_admin': username in super_admins
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
        is_super = requester in super_admins
        is_admin = requester in (room_data['admins'] or [])
        if not is_super and not is_admin:
            emit('kick_result', {'success': False, 'msg': '无权限'})
            conn.close()
            return
        if target in super_admins:
            emit('kick_result', {'success': False, 'msg': '不能踢出超级管理员'})
            conn.close()
            return
        if not is_super and target in (room_data['admins'] or []):
            emit('kick_result', {'success': False, 'msg': '不能踢出管理员'})
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

# ── 超管管理 ──────────────────────────────────────────────
@socketio.on('set_super_admin')
def handle_set_super_admin(data):
    if data['requester'] != SUPER_ADMIN:
        emit('set_super_admin_result', {'success': False, 'msg': '只有 admin 可以管理超级管理员'})
        return
    target = data['target']
    promote = data['promote']
    if target == SUPER_ADMIN:
        emit('set_super_admin_result', {'success': False, 'msg': '不能修改 admin 自身的权限'})
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT username FROM users WHERE username = %s', (target,))
        if not cur.fetchone():
            emit('set_super_admin_result', {'success': False, 'msg': '用户不存在'})
            conn.close()
            return
        cur.execute('UPDATE users SET is_super_admin = %s WHERE username = %s', (promote, target))
        conn.commit()
        conn.close()
        if promote:
            super_admins.add(target)
        else:
            super_admins.discard(target)
        emit('set_super_admin_result', {'success': True, 'target': target, 'promote': promote})
    except Exception as e:
        emit('set_super_admin_result', {'success': False, 'msg': str(e)})

# ── 语音信令 ──────────────────────────────────────────────
@socketio.on('voice_join')
def handle_voice_join(data):
    username = data['username']
    screenname = data.get('screenname', username)
    room = data['room']
    if room not in rooms_voice:
        rooms_voice[room] = {'voice_members': [], 'voice_banned': []}
    if not any(m['username'] == username for m in rooms_voice[room]['voice_members']):
        rooms_voice[room]['voice_members'].append({'username': username, 'screenname': screenname})
    emit('voice_user_joined', {'username': username, 'screenname': screenname}, to=room)
    emit('voice_current_members', {'members': rooms_voice[room]['voice_members']})

@socketio.on('voice_leave')
def handle_voice_leave(data):
    username = data['username']
    room = data['room']
    if room in rooms_voice:
        rooms_voice[room]['voice_members'] = [m for m in rooms_voice[room]['voice_members'] if m['username'] != username]
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
        if not room_data or data['requester'] not in (room_data['admins'] or []):
            return
    except:
        return
    emit('voice_banned', {'target': data['target']}, to=data['room'])

@socketio.on('voice_speaking')
def handle_voice_speaking(data):
    emit('voice_speaking', data, to=data['room'])

# ── 启动 ──────────────────────────────────────────────────
def ensure_lobby():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT name FROM rooms WHERE name = '大厅'")
        if not cur.fetchone():
            cur.execute('INSERT INTO rooms (name, admins, members) VALUES (%s, %s, %s)',
                        ('大厅', [SUPER_ADMIN], []))
            conn.commit()
        conn.close()
    except Exception as e:
        print('创建大厅失败:', e)

if __name__ == '__main__':
    load_super_admins()
    ensure_lobby()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
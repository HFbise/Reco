import os
import json
import uuid

from datetime import datetime
from flask import Flask, render_template, session, request
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'reco-secret-2024'
socketio = SocketIO(app, async_mode='threading')

# ── 数据文件路径 ──────────────────────────────────────────
USERS_FILE = 'data/users.json'
ROOMS_FILE = 'data/rooms.json'
MESSAGES_FILE = 'data/messages.json'

SECURITY_QUESTIONS = [
    "你的出生城市是？",
    "你的小学名字是？",
    "你最喜欢的宠物名字是？",
    "你母亲的娘家姓是？",
    "你的第一辆车的品牌是？",
    "你最喜欢的老师叫什么？"
]

# 超级管理员用户名（改成你自己的）
SUPER_ADMIN = "admin"
DEFAULT_PASSWORD = "reco1234"

# ── 用户数据读写 ──────────────────────────────────────────
def load_users():
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

def load_rooms():
    if not os.path.exists(ROOMS_FILE):
        return {}
    with open(ROOMS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_rooms(rooms_data):
    with open(ROOMS_FILE, 'w', encoding='utf-8') as f:
        json.dump(rooms_data, f, ensure_ascii=False, indent=2)

def load_messages():
    if not os.path.exists(MESSAGES_FILE):
        return {}
    with open(MESSAGES_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_messages(messages):
    with open(MESSAGES_FILE, 'w', encoding='utf-8') as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)

# ── 内存中的房间数据 ──────────────────────────────────────
rooms = load_rooms()
# 格式: { "房间名": { "admins": ["username"], "members": ["username"] } }

# ── 页面路由 ──────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

# ── 用户注册 ──────────────────────────────────────────────
@socketio.on('register')
def handle_register(data):
    users = load_users()
    username = data['username'].strip()
    screenname = data['screenname'].strip()
    password = data['password']
    bio = data.get('bio', '').strip()
    security_q = data['security_question']
    security_a = data['security_answer'].strip().lower()

    if username in users:
        emit('register_result', {'success': False, 'msg': '用户名已存在'})
        return
    if len(username) < 3:
        emit('register_result', {'success': False, 'msg': '用户名至少3位'})
        return
    if len(password) < 6:
        emit('register_result', {'success': False, 'msg': '密码至少6位'})
        return

    users[username] = {
        'screenname': screenname,
        'password': password,
        'bio': bio,
        'security_question': security_q,
        'security_answer': security_a
    }
    save_users(users)
    emit('register_result', {'success': True})

# ── 用户登录 ──────────────────────────────────────────────
@socketio.on('login')
def handle_login(data):
    users = load_users()
    username = data['username'].strip()
    password = data['password']

    if username not in users:
        emit('login_result', {'success': False, 'msg': '用户名不存在'})
        return
    if users[username]['password'] != password:
        emit('login_result', {'success': False, 'msg': '密码错误'})
        return

    session['username'] = username
    emit('login_result', {
        'success': True,
        'username': username,
        'screenname': users[username]['screenname'],
        'is_super_admin': username == SUPER_ADMIN
    })

# ── 获取用户资料 ──────────────────────────────────────────
@socketio.on('get_profile')
def handle_get_profile(data):
    users = load_users()
    username = data['username']
    if username not in users:
        emit('profile_result', {'success': False})
        return
    u = users[username]
    emit('profile_result', {
        'success': True,
        'screenname': u['screenname'],
        'bio': u['bio']
    })

# ── 修改显示名/简介 ───────────────────────────────────────
@socketio.on('update_profile')
def handle_update_profile(data):
    users = load_users()
    username = data['username']
    if username not in users:
        emit('update_profile_result', {'success': False, 'msg': '用户不存在'})
        return
    users[username]['screenname'] = data['screenname'].strip()
    users[username]['bio'] = data['bio'].strip()
    save_users(users)
    emit('update_profile_result', {'success': True, 'screenname': data['screenname'].strip()})

# ── 修改密码 ──────────────────────────────────────────────
@socketio.on('change_password')
def handle_change_password(data):
    users = load_users()
    username = data['username']
    old_pw = data['old_password']
    new_pw = data['new_password']

    if users[username]['password'] != old_pw:
        emit('change_password_result', {'success': False, 'msg': '旧密码错误'})
        return
    if len(new_pw) < 6:
        emit('change_password_result', {'success': False, 'msg': '新密码至少6位'})
        return

    users[username]['password'] = new_pw
    save_users(users)
    emit('change_password_result', {'success': True})

# ── 忘记密码：获取安全问题 ────────────────────────────────
@socketio.on('get_security_question')
def handle_get_security_question(data):
    users = load_users()
    username = data['username'].strip()
    if username not in users:
        emit('security_question_result', {'success': False, 'msg': '用户名不存在'})
        return
    emit('security_question_result', {
        'success': True,
        'question': users[username]['security_question']
    })

# ── 忘记密码：验证答案并重置 ──────────────────────────────
@socketio.on('reset_password')
def handle_reset_password(data):
    users = load_users()
    username = data['username'].strip()
    answer = data['answer'].strip().lower()
    new_pw = data['new_password']

    if users[username]['security_answer'] != answer:
        emit('reset_password_result', {'success': False, 'msg': '答案错误'})
        return
    if len(new_pw) < 6:
        emit('reset_password_result', {'success': False, 'msg': '新密码至少6位'})
        return

    users[username]['password'] = new_pw
    save_users(users)
    emit('reset_password_result', {'success': True})

# ── 超级管理员重置密码 ────────────────────────────────────
@socketio.on('admin_reset_password')
def handle_admin_reset(data):
    users = load_users()
    requester = data['requester']
    target = data['target_username'].strip()

    if requester != SUPER_ADMIN:
        emit('admin_reset_result', {'success': False, 'msg': '无权限'})
        return
    if target not in users:
        emit('admin_reset_result', {'success': False, 'msg': '用户不存在'})
        return

    users[target]['password'] = DEFAULT_PASSWORD
    save_users(users)
    emit('admin_reset_result', {'success': True, 'msg': f'{target} 的密码已重置为 {DEFAULT_PASSWORD}'})

# ── 获取安全问题列表 ──────────────────────────────────────
@socketio.on('get_questions_list')
def handle_get_questions():
    print('get_questions_list received')
    emit('questions_list', {'questions': SECURITY_QUESTIONS})

# ── 房间：创建 ────────────────────────────────────────────
@socketio.on('create_room')
def handle_create_room(data):
    username = data['username']
    room = data['room'].strip()

    if room in rooms:
        emit('create_room_result', {'success': False, 'msg': '房间已存在'})
        return

    rooms[room] = {
        'admins': [username],
        'members': []
    }
    save_rooms(rooms)
    emit('create_room_result', {'success': True, 'room': room})

# ── 房间：加入 ────────────────────────────────────────────
@socketio.on('join')
def handle_join(data):
    username = data['username']
    screenname = data['screenname']
    room = data['room'].strip()

    if room not in rooms:
        emit('join_result', {'success': False, 'msg': '房间不存在'})
        return

    join_room(room)
    if username not in rooms[room]['members']:
        rooms[room]['members'].append(username)

    is_admin = username in rooms[room]['admins']
    emit('join_result', {'success': True, 'room': room, 'is_admin': is_admin})

    # 发送历史消息
    messages = load_messages()
    history = messages.get(room, [])
    for msg in history[-50:]:  # 最多50条
        emit('message', msg)
    
    emit('message', {
        'screenname': '系统',
        'text': f"{screenname} 加入了房间",
        'system': True
    }, to=room)

# ── 房间：发消息 ──────────────────────────────────────────
@socketio.on('message')
def handle_message(data):
    if not data.get('system'):
        messages = load_messages()
        room = data['room']
        if room not in messages:
            messages[room] = []
        data['time'] = datetime.now().strftime('%H:%M')
        messages[room].append(data)
        save_messages(messages)
    emit('message', data, to=data['room'])

# ── 房间：设置管理员 ──────────────────────────────────────
@socketio.on('set_admin')
def handle_set_admin(data):
    requester = data['requester']
    target = data['target']
    room = data['room']

    if room not in rooms or requester not in rooms[room]['admins']:
        emit('set_admin_result', {'success': False, 'msg': '无权限'})
        return
    if target not in rooms[room]['members']:
        emit('set_admin_result', {'success': False, 'msg': '该用户不在房间内'})
        return

    if target not in rooms[room]['admins']:
        rooms[room]['admins'].append(target)

    emit('set_admin_result', {'success': True, 'target': target})
    emit('message', {
        'screenname': '系统',
        'text': f"{target} 成为了管理员",
        'system': True
    }, to=room)

# ── 房间：关闭房间 ────────────────────────────────────────
@socketio.on('close_room')
def handle_close_room(data):
    requester = data['requester']
    room = data['room']

    if room not in rooms or (requester not in rooms[room]['admins'] and requester != SUPER_ADMIN):
        emit('close_room_result', {'success': False, 'msg': '无权限'})
        return

    emit('message', {
        'screenname': '系统',
        'text': '房间已被管理员关闭',
        'system': True
    }, to=room)
    emit('room_closed', {}, to=room)
    del rooms[room]
    save_rooms(rooms)
    messages = load_messages()
    if room in messages:
        del messages[room]
        save_messages(messages)

@socketio.on('get_rooms')
def handle_get_rooms():
    emit('rooms_list', {'rooms': list(rooms.keys())})

@socketio.on('get_members')
def handle_get_members(data):
    room = data['room']
    if room not in rooms:
        emit('members_list', {'members': []})
        return
    users = load_users()
    members = []
    for username in rooms[room]['members']:
        if username in users:
            members.append({
                'username': username,
                'screenname': users[username]['screenname'],
                'is_admin': username in rooms[room]['admins']
            })
    emit('members_list', {'members': members})

# ── 语音：加入语音频道 ────────────────────────────────────
@socketio.on('voice_join')
def handle_voice_join(data):
    username = data['username']
    room = data['room']
    
    if room not in rooms:
        return
    
    if 'voice_members' not in rooms[room]:
        rooms[room]['voice_members'] = []
    
    if username not in rooms[room]['voice_members']:
        rooms[room]['voice_members'].append(username)
    
    # 告诉房间里其他语音成员有新人加入
    emit('voice_user_joined', {'username': username}, to=room)
    # 告诉新人当前语音里有哪些人
    emit('voice_current_members', {'members': rooms[room]['voice_members']})

# ── 语音：离开语音频道 ────────────────────────────────────
@socketio.on('voice_leave')
def handle_voice_leave(data):
    username = data['username']
    room = data['room']
    
    if room in rooms and 'voice_members' in rooms[room]:
        if username in rooms[room]['voice_members']:
            rooms[room]['voice_members'].remove(username)
    
    emit('voice_user_left', {'username': username}, to=room)

# ── 语音：WebRTC 信令 ─────────────────────────────────────
@socketio.on('voice_offer')
def handle_voice_offer(data):
    # 转发 offer 给目标用户
    emit('voice_offer', data, to=data['room'])

@socketio.on('voice_answer')
def handle_voice_answer(data):
    emit('voice_answer', data, to=data['room'])

@socketio.on('voice_ice')
def handle_voice_ice(data):
    emit('voice_ice', data, to=data['room'])

# ── 语音：闭麦状态同步 ────────────────────────────────────
@socketio.on('voice_mute_status')
def handle_voice_mute(data):
    emit('voice_mute_status', data, to=data['room'])

# ── 语音：禁言 ───────────────────────────────────────────
@socketio.on('voice_ban')
def handle_voice_ban(data):
    requester = data['requester']
    room = data['room']
    target = data['target']
    
    if room not in rooms or requester not in rooms[room]['admins']:
        return
    
    if 'voice_banned' not in rooms[room]:
        rooms[room]['voice_banned'] = []
    
    if target not in rooms[room]['voice_banned']:
        rooms[room]['voice_banned'].append(target)
    
    emit('voice_banned', {'target': target}, to=room)

# ── 语音：解除禁言 ────────────────────────────────────────
@socketio.on('voice_unban')
def handle_voice_unban(data):
    requester = data['requester']
    room = data['room']
    target = data['target']
    
    if room not in rooms or requester not in rooms[room]['admins']:
        return
    
    if 'voice_banned' in rooms[room] and target in rooms[room]['voice_banned']:
        rooms[room]['voice_banned'].remove(target)
    
    emit('voice_unbanned', {'target': target}, to=room)

# ── 语音：说话状态 ────────────────────────────────────────
@socketio.on('voice_speaking')
def handle_voice_speaking(data):
    emit('voice_speaking', data, to=data['room'])

# ── 启动 ──────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
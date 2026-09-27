import os
import logging
import base64
import hmac
import hashlib
import json
import time
from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)

from flask import send_from_directory, request, jsonify
from extensions import app, socketio
from db import get_db
from state import rooms_voice, online_users
from auth_session import verify_token
from admin import admin_bp

import handlers  # registers all socket event handlers

app.register_blueprint(admin_bp)

# ── Static / SPA ──────────────────────────────────────────────
DIST_DIR = os.path.join(os.path.dirname(__file__), 'app', 'dist')


@app.route('/')
def index():
    if os.path.isdir(DIST_DIR):
        return send_from_directory(DIST_DIR, 'index.html')
    return send_from_directory('templates', 'index.html')


@app.route('/<path:path>')
def spa_static(path):
    if os.path.isdir(DIST_DIR):
        full = os.path.join(DIST_DIR, path)
        if os.path.isfile(full):
            return send_from_directory(DIST_DIR, path)
        return send_from_directory(DIST_DIR, 'index.html')
    return send_from_directory('templates', 'index.html')


@app.route('/favicon.ico')
def favicon():
    return send_from_directory('static', 'icon.svg', mimetype='image/svg+xml')


@app.route('/sw.js')
def service_worker():
    resp = app.send_static_file('sw.js')
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


# ── Privacy policy ────────────────────────────────────────────
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


# ── Voice leave beacon (page close) ──────────────────────────
@app.route('/api/voice-leave', methods=['POST'])
def api_voice_leave():
    try:
        data = json.loads(request.get_data(as_text=True))
    except Exception:
        data = {}
    username = verify_token(data.get('token', ''))
    room = data.get('room', '')
    if username and room and room in rooms_voice:
        rooms_voice[room]['voice_members'] = [
            m for m in rooms_voice[room]['voice_members'] if m['username'] != username
        ]
        socketio.emit('voice_user_left', {'username': username, 'room': room}, to=room)
    return '', 204


# ── TURN credentials ──────────────────────────────────────────
TURN_HOST   = os.environ.get('TURN_HOST', '129.153.163.143')
TURN_PORT   = int(os.environ.get('TURN_PORT', '3478'))
TURN_SECRET = os.environ.get('TURN_SECRET', '')


@app.route('/api/ice-servers')
def get_ice_servers():
    # TURN relays cost bandwidth: only hand credentials to logged-in users
    username = verify_token(request.args.get('t', ''))
    if not username or not TURN_SECRET:
        return jsonify([])
    expiry    = int(time.time()) + 86400
    turn_user = f'{expiry}:{username}'
    turn_pass = base64.b64encode(
        hmac.new(TURN_SECRET.encode(), turn_user.encode(), hashlib.sha1).digest()
    ).decode()
    return jsonify([
        {'urls': f'stun:{TURN_HOST}:{TURN_PORT}'},
        {'urls': f'turn:{TURN_HOST}:{TURN_PORT}',
         'username': turn_user, 'credential': turn_pass},
        {'urls': f'turn:{TURN_HOST}:{TURN_PORT}?transport=tcp',
         'username': turn_user, 'credential': turn_pass},
    ])


# ── Startup migrations ────────────────────────────────────────
def _migrate():
    log = logging.getLogger('migrate')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            # Base tables (no-ops on an existing database; lets a fresh DB bootstrap itself)
            cur.execute('''CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY, screenname TEXT NOT NULL, password TEXT NOT NULL,
                bio TEXT DEFAULT '', security_question TEXT, security_answer TEXT)''')
            cur.execute('''CREATE TABLE IF NOT EXISTS rooms (
                name TEXT PRIMARY KEY, admins TEXT[] DEFAULT '{}', members TEXT[] DEFAULT '{}')''')
            cur.execute('''CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY, room TEXT NOT NULL, username TEXT NOT NULL,
                screenname TEXT, text TEXT NOT NULL, time TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW())''')
            cur.execute("CREATE INDEX IF NOT EXISTS messages_room_created_idx ON messages(room, created_at)")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB")
            cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password TEXT")
            cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner TEXT")
            cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kicked TEXT[]")
            cur.execute("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS code TEXT")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled BOOLEAN DEFAULT FALSE")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb")
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS system BOOLEAN DEFAULT FALSE")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_expression TEXT")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE")
            cur.execute('''CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY, reporter TEXT NOT NULL, reported TEXT NOT NULL,
                reason TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW())''')
            cur.execute('''CREATE TABLE IF NOT EXISTS blocks (
                blocker TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY (blocker, blocked))''')
            cur.execute('''CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY, username TEXT NOT NULL, text TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW())''')
            cur.execute('''CREATE TABLE IF NOT EXISTS dm_closed (
                username TEXT NOT NULL, dm_room TEXT NOT NULL,
                closed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (username, dm_room))''')
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_idx ON rooms(code) WHERE code IS NOT NULL")

            # Backfill missing room codes
            import random, string
            cur.execute("SELECT name FROM rooms WHERE code IS NULL")
            for row in cur.fetchall():
                while True:
                    code = ''.join(random.choices(string.digits, k=6))
                    cur.execute('SELECT 1 FROM rooms WHERE code = %s', (code,))
                    if not cur.fetchone():
                        break
                cur.execute("UPDATE rooms SET code = %s WHERE name = %s", (code, row['name']))

            # Remove site admins from room member lists
            cur.execute("SELECT username FROM users WHERE is_admin = TRUE")
            for admin_row in cur.fetchall():
                cur.execute(
                    "UPDATE rooms SET members = array_remove(members, %s),"
                    " admins = array_remove(admins, %s)",
                    (admin_row['username'], admin_row['username'])
                )

            # Ensure lobby exists
            cur.execute("SELECT name FROM rooms WHERE name = '大厅'")
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO rooms (name, admins, members, owner) VALUES (%s, %s, %s, %s)",
                    ('大厅', [], [], 'admin')
                )
            conn.commit()
    except Exception as e:
        log.error('migration failed: %s', e)


if __name__ == '__main__':
    _migrate()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)

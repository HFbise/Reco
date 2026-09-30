import base64
import hashlib
import hmac
import html
import json
import logging
import mimetypes
import os
import time

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)
log = logging.getLogger('app')

from flask import jsonify, request, send_from_directory

import chat_prefs
import client_errors
import demo
import handlers  # noqa: F401  (side effect: registers every Socket.IO event handler)
import images
import oauth
import reads
import room_log
import voice_state
import webpush
from admin import admin_bp
from auth_session import verify_token
from db import get_db
from extensions import app, socketio
from handlers import match as match_handlers
from state import LOBBY, online_users

app.register_blueprint(admin_bp)
app.register_blueprint(images.bp)
app.register_blueprint(client_errors.bp)
app.register_blueprint(oauth.bp)
app.register_blueprint(webpush.bp)

# ── Web app (Expo web build, served as a single-page app) ─────
DIST_DIR = os.path.join(os.path.dirname(__file__), 'app', 'dist')
# Not in every system's MIME table; browsers want it right to install the app
mimetypes.add_type('application/manifest+json', '.webmanifest')


@app.route('/')
def index():
    return send_from_directory(DIST_DIR, 'index.html')


@app.route('/<path:path>')
def spa_static(path):
    if os.path.isfile(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, 'index.html')  # client-side routes


# Browsers that used the retired vanilla frontend still have its service worker
# registered. This replacement clears its caches and unregisters itself.
_RETIRED_SERVICE_WORKER = """self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .then(() => self.registration.unregister())
));
"""


@app.route('/sw.js')
def retired_service_worker():
    return _RETIRED_SERVICE_WORKER, 200, {'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache'}


# ── Health check ──────────────────────────────────────────────
@app.route('/health')
def health():
    """For the platform's health checks and uptime monitors: 200 only if the
    database answers too, so a lost DB connection shows up as unhealthy."""
    try:
        with get_db(timeout=5) as conn:
            conn.cursor().execute('SELECT 1')
    except Exception as e:
        log.exception('health check failed: %s', e)
        return jsonify(status='error', database='unreachable'), 503
    # Which commit is live (Render sets RENDER_GIT_COMMIT): lets a deploy check wait for its own push
    return jsonify(
        status='ok', database='ok', online_users=len(online_users), commit=os.environ.get('RENDER_GIT_COMMIT', '')[:7]
    )


# ── Privacy policy ────────────────────────────────────────────
def _privacy_contact():
    email = html.escape(os.environ.get('PRIVACY_CONTACT_EMAIL', ''))
    if email:
        return f'<p>如有隐私相关问题，请联系：<a href="mailto:{email}">{email}</a></p>'
    return '<p>如有隐私相关问题，请通过 App 内「我的资料 → 意见反馈」联系我们。</p>'


@app.route('/privacy')
def privacy_policy():
    return (
        """<!DOCTYPE html>
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
<h2>随机匹配</h2>
<p>随机匹配中，对方看不到你的用户名和资料。匹配聊天的内容会保存 7 天，仅在有人举报时供管理员核查，之后自动删除。语音匹配经由我们的中转服务器传输，双方不会获知彼此的 IP 地址。</p>
<h2>账号删除</h2>
<p>你可以随时在 App 内「我的资料 → 删除账号」永久删除账号及相关数据。</p>
<h2>联系我们</h2>
__CONTACT__
</body></html>""".replace('__CONTACT__', _privacy_contact()),
        200,
        {'Content-Type': 'text/html; charset=utf-8'},
    )


# ── Voice leave beacon (page close) ──────────────────────────
@app.route('/api/voice-leave', methods=['POST'])
def api_voice_leave():
    try:
        data = json.loads(request.get_data(as_text=True))
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    # The socket may take a while to time out after the tab closes; this frees the seat now
    username = verify_token(str(data.get('token') or ''))
    room = data.get('room')
    if username and isinstance(room, str):
        voice_state.remove_user(username, room)
    return '', 204


# ── TURN credentials ──────────────────────────────────────────
TURN_HOST = os.environ.get('TURN_HOST', '')
TURN_PORT = int(os.environ.get('TURN_PORT', '3478'))
TURN_SECRET = os.environ.get('TURN_SECRET', '')


@app.route('/api/ice-servers')
def get_ice_servers():
    # TURN relays cost bandwidth: only hand credentials to logged-in users.
    # Token goes in a header, not the URL, so it stays out of access logs.
    auth = request.headers.get('Authorization', '')
    username = verify_token(auth[7:] if auth.startswith('Bearer ') else '')
    if not username or not TURN_HOST or not TURN_SECRET:
        return jsonify([])
    expiry = int(time.time()) + 86400
    turn_user = f'{expiry}:{username}'
    turn_pass = base64.b64encode(hmac.new(TURN_SECRET.encode(), turn_user.encode(), hashlib.sha1).digest()).decode()
    return jsonify(
        [
            {'urls': f'stun:{TURN_HOST}:{TURN_PORT}'},
            {'urls': f'turn:{TURN_HOST}:{TURN_PORT}', 'username': turn_user, 'credential': turn_pass},
            {'urls': f'turn:{TURN_HOST}:{TURN_PORT}?transport=tcp', 'username': turn_user, 'credential': turn_pass},
        ]
    )


# ── Startup migrations ────────────────────────────────────────
LEGACY_SYSTEM_SUFFIXES = {
    'user_joined': ' 加入了房间',
    'user_left': ' 离开了房间',
    'user_kicked': ' 被踢出了房间',
    'admin_added': ' 成为了管理员',
    'admin_removed': ' 被取消了管理员',
}


def _migrate():
    log = logging.getLogger('migrate')
    try:
        with get_db() as conn:
            cur = conn.cursor()
            # Base tables (no-ops on an existing database; lets a fresh DB bootstrap itself)
            cur.execute("""CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY, screenname TEXT NOT NULL, password TEXT NOT NULL,
                bio TEXT DEFAULT '', security_question TEXT, security_answer TEXT)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS rooms (
                name TEXT PRIMARY KEY, admins TEXT[] DEFAULT '{}', members TEXT[] DEFAULT '{}')""")
            cur.execute("""CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY, room TEXT NOT NULL, username TEXT NOT NULL,
                screenname TEXT, text TEXT NOT NULL, time TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW())""")
            cur.execute('CREATE INDEX IF NOT EXISTS messages_room_created_idx ON messages(room, created_at)')
            cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta JSONB')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password TEXT')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner TEXT')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kicked TEXT[]')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS code TEXT')
            cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS recalled BOOLEAN DEFAULT FALSE')
            cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE')
            cur.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb")
            cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS system BOOLEAN DEFAULT FALSE')
            cur.execute('ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to INTEGER')
            cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_expression TEXT')
            cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT')
            cur.execute('ALTER TABLE users DROP COLUMN IF EXISTS is_admin')
            cur.execute("""CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY, reporter TEXT NOT NULL, reported TEXT NOT NULL,
                reason TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW())""")
            cur.execute("""CREATE TABLE IF NOT EXISTS blocks (
                blocker TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY (blocker, blocked))""")
            cur.execute("""CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY, username TEXT NOT NULL, text TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW())""")
            cur.execute("""CREATE TABLE IF NOT EXISTS push_tokens (
                token TEXT PRIMARY KEY, username TEXT NOT NULL, platform TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW())""")
            cur.execute('CREATE INDEX IF NOT EXISTS push_tokens_username_idx ON push_tokens(username)')
            # Text mutes ('text') and voice bans ('voice'); NULL expires_at = until lifted
            cur.execute("""CREATE TABLE IF NOT EXISTS room_restrictions (
                room TEXT NOT NULL, username TEXT NOT NULL, kind TEXT NOT NULL,
                expires_at TIMESTAMPTZ, PRIMARY KEY (room, username, kind))""")
            # One-time passes into password-protected rooms
            cur.execute("""CREATE TABLE IF NOT EXISTS room_invites (
                room TEXT NOT NULL, username TEXT NOT NULL, invited_by TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (room, username))""")
            # Random matches (see handlers/match.py); transcripts live in messages as room 'match:<id>'
            cur.execute("""CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY, mode TEXT NOT NULL, user_a TEXT NOT NULL, user_b TEXT NOT NULL,
                tags TEXT[] DEFAULT '{}', started_at TIMESTAMPTZ DEFAULT NOW(), ended_at TIMESTAMPTZ,
                ended_by TEXT, end_reason TEXT, a_keeps BOOLEAN DEFAULT FALSE, b_keeps BOOLEAN DEFAULT FALSE,
                dm_room TEXT)""")
            cur.execute('ALTER TABLE reports ADD COLUMN IF NOT EXISTS match_id INTEGER')
            cur.execute("""CREATE TABLE IF NOT EXISTS deleted_usernames (
                username TEXT PRIMARY KEY, deleted_at TIMESTAMPTZ DEFAULT NOW())""")
            cur.execute("""CREATE TABLE IF NOT EXISTS dm_closed (
                username TEXT NOT NULL, dm_room TEXT NOT NULL,
                closed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (username, dm_room))""")
            cur.execute('CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_idx ON rooms(code) WHERE code IS NOT NULL')
            reads.migrate(cur)
            images.migrate(cur)
            oauth.migrate(cur)
            webpush.migrate(cur)
            chat_prefs.migrate(cur)
            room_log.migrate(cur)
            # The room card: shown to everyone, edited by the owner and admins
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description TEXT')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS announcement TEXT')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS announcement_by TEXT')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS announcement_at TIMESTAMPTZ')
            cur.execute('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS invite_only BOOLEAN NOT NULL DEFAULT FALSE')

            # Backfill missing room codes
            import random
            import string

            cur.execute('SELECT name FROM rooms WHERE code IS NULL')
            for row in cur.fetchall():
                while True:
                    code = ''.join(random.choices(string.digits, k=6))
                    cur.execute('SELECT 1 FROM rooms WHERE code = %s', (code,))
                    if not cur.fetchone():
                        break
                cur.execute('UPDATE rooms SET code = %s WHERE name = %s', (code, row['name']))

            # System messages from before they carried a code: recover code + name from the
            # Chinese sentence so clients can show them in any language (idempotent).
            for code, suffix in LEGACY_SYSTEM_SUFFIXES.items():
                cur.execute(
                    "UPDATE messages SET system = TRUE, meta = jsonb_build_object('system', jsonb_build_object("
                    " 'code', %s, 'params', jsonb_build_object('name', left(text, length(text) - length(%s)))))"
                    " WHERE (system OR username = 'system') AND meta IS NULL AND right(text, length(%s)) = %s",
                    (code, suffix, suffix, suffix),
                )
                if cur.rowcount:
                    log.info('converted %d legacy "%s" system messages', cur.rowcount, code)

            # The lobby belongs to nobody: it is moderated only from the admin panel
            cur.execute(
                "INSERT INTO rooms (name, admins, members, owner) VALUES (%s, '{}', '{}', NULL)"
                " ON CONFLICT (name) DO UPDATE SET owner = NULL, admins = '{}'",
                (LOBBY,),
            )
            conn.commit()  # schema first: nothing below may roll it back

            try:
                demo.seed(cur)
                conn.commit()
            except Exception as e:
                conn.rollback()
                log.exception('demo seed failed: %s', e)
        match_handlers.purge_expired()  # 7-day retention for match transcripts
    except Exception as e:
        log.exception('migration failed: %s', e)


# Local development only (Werkzeug). Production runs gunicorn via wsgi.py.
if __name__ == '__main__':
    _migrate()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)

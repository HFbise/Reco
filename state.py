import logging
import time
from datetime import datetime

from db import get_db

log = logging.getLogger(__name__)

# ── In-memory state ───────────────────────────────────────────
# The lobby: every user can see and join it; it has no owner (moderated from /admin).
# Its name doubles as its room id in the database.
LOBBY = '大厅'

# Only live, per-process state lives here. Anything that must survive a restart
# (mutes, voice bans, invites, push tokens) is in the database.
rooms_voice: dict = {}  # { room: { voice_members } }
rooms_stream: dict = {}  # { room: { username: screenname } }
online_users: dict = {}  # { username: set of sids }
hidden_sids: set = set()  # sockets whose page is in the background (web tabs report it)
sid_to_voice: dict = {}  # { sid: (username, room) }
message_rate: dict = {}  # { username: [timestamps] }
login_attempts: dict = {}  # { username: {'count': N, 'until': float} }


def get_level(username: str, room_data: dict) -> int:
    """2=owner, 1=room admin, 0=member"""
    if username == (room_data.get('owner') or ''):
        return 2
    if username in (room_data.get('admins') or []):
        return 1
    return 0


# ── Rate limiting ─────────────────────────────────────────────


def check_msg_rate(username: str, max_msgs: int = 8, window: int = 10) -> bool:
    now = time.time()
    ts = [t for t in message_rate.get(username, []) if now - t < window]
    if len(ts) >= max_msgs:
        message_rate[username] = ts
        return False
    ts.append(now)
    message_rate[username] = ts
    return True


def check_login_rate(username: str):
    """Returns (allowed, seconds_left)."""
    now = time.time()
    d = login_attempts.get(username, {})
    until = d.get('until', 0)
    if until > now:
        return False, int(until - now)
    return True, 0


def record_login_fail(username: str):
    now = time.time()
    d = login_attempts.get(username, {'count': 0})
    d['count'] = d.get('count', 0) + 1
    if d['count'] >= 10:
        d['until'] = now + 300
        d['count'] = 0
    login_attempts[username] = d


def reset_login_attempts(username: str):
    login_attempts.pop(username, None)


# ── System messages ───────────────────────────────────────────

# Clients render system messages from `code` + `params` in their own language.
# The Chinese `text` is stored alongside for the admin panel and older clients.
SYSTEM_TEXT_ZH = {
    'user_joined': '{name} 加入了房间',
    'user_left': '{name} 离开了房间',
    'user_kicked': '{name} 被踢出了房间',
    'admin_added': '{name} 成为了管理员',
    'admin_removed': '{name} 被取消了管理员',
    'room_closed': '房间已被关闭',
    'match_connected': '你们通过随机匹配认识了，打个招呼吧',
}


def emit_system_msg(room: str, code: str, **params):
    # Import here to avoid circular import (socketio lives in extensions)
    import json

    from extensions import socketio

    text = SYSTEM_TEXT_ZH[code].format(**params)
    meta = {'system': {'code': code, 'params': params}}
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time, system, meta)'
                ' VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb) RETURNING id, created_at',
                (room, 'system', '系统', text, datetime.now().strftime('%H:%M'), True, json.dumps(meta)),
            )
            saved = cur.fetchone()
            conn.commit()
        socketio.emit(
            'message',
            {
                'id': saved['id'],
                'username': 'system',
                'screenname': '系统',
                'text': text,
                'time': saved['created_at'].isoformat(),
                'room': room,
                'system': True,
                'meta': meta,
            },
            to=room,
        )
    except Exception as e:
        log.exception('emit_system_msg failed: %s', e)


def is_watching(username) -> bool:
    """Has Reco on screen somewhere: a socket whose page isn't hidden. If not, the web
    gets a push notification even though a background tab is still connected."""
    return any(sid not in hidden_sids for sid in online_users.get(username, ()))

"""The site admin panel (/admin): numbers, feedback, reports with match transcripts, users
(reset password, rename, delete), rooms (kick, mute, voice-ban, recall, close) and TURN usage.

Signed in with ADMIN_PASSWORD (a session cookie, SameSite=Lax). Pages are Jinja templates in
admin_templates/admin/, which escape everything they show; the views only gather data.
"""

import functools
import hmac
import logging
import os
from urllib.parse import quote

from flask import Blueprint, redirect, render_template, request, session, url_for

import images
import moderation
import room_log
import turn_usage
from auth_session import end_sessions
from db import get_db
from state import LOBBY, check_login_rate, client_ip, online_users, record_login_fail, reset_login_attempts
from utils import hash_password

log = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, url_prefix='/admin', template_folder='admin_templates')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

PER_PAGE = 50
ADMIN_ALL = 'admin-login:*'  # failed admin sign-ins from anywhere
MIN_PASSWORD_LEN = 6
MUTE_OPTIONS = [(600, '10 分钟'), (3600, '1 小时'), (86400, '1 天'), (0, '永久')]
RESTRICTION_LABELS = {moderation.TEXT: '禁言', moderation.VOICE: '语音禁言'}
LOG_LABELS = {
    'kick': '踢出', 'unkick': '解封', 'mute': '禁言', 'unmute': '解除禁言', 'voice_ban': '禁止语音',
    'voice_unban': '恢复语音', 'admin_add': '设为管理员', 'admin_remove': '取消管理员', 'recall': '撤回消息',
    'join_mode': '改加入方式', 'description': '改简介', 'announcement': '改公告',
}  # fmt: skip


def login_required(view):
    @functools.wraps(view)
    def inner(*args, **kwargs):
        if not session.get('admin_authed'):
            return redirect(url_for('admin.login'))
        return view(*args, **kwargs)

    return inner


def _page_number() -> int:
    return max(1, request.args.get('page', 1, type=int) or 1)


def _back(default=None, ok=None, error=None):
    """Back to the form's `next` (admin pages only, never elsewhere) or `default`, with a notice."""
    target = request.form.get('next') or default or url_for('admin.dashboard')
    if not target.startswith('/admin/'):
        target = url_for('admin.dashboard')
    message = error or ok
    if message:
        target += ('&' if '?' in target else '?') + ('error=' if error else 'ok=') + quote(message)
    return redirect(target)


def _form_user() -> str:
    return (request.form.get('username') or '').strip()


def _form_kind() -> str:
    kind = request.form.get('kind')
    return kind if kind in RESTRICTION_LABELS else moderation.TEXT


# ── signing in ────────────────────────────────────────────────


@admin_bp.route('/')
def index():
    return redirect(url_for('admin.dashboard'))


@admin_bp.route('/login', methods=['GET', 'POST'])
def login():
    if not ADMIN_PASSWORD:
        return render_template('admin/login.html', error='后台未启用：服务器没有设置 ADMIN_PASSWORD'), 503
    if request.method == 'GET':
        return render_template('admin/login.html')
    # Per address, and across all addresses: an address can be faked in X-Forwarded-For, so only
    # the overall limit really bounds guessing (it can lock the real admin out for a while too)
    rate_key = f'admin-login:{client_ip()}'
    secs = max(check_login_rate(rate_key)[1], check_login_rate(ADMIN_ALL)[1])
    if secs:
        return render_template('admin/login.html', error=f'尝试过多，请 {secs} 秒后重试'), 429
    if hmac.compare_digest((request.form.get('password') or '').encode(), ADMIN_PASSWORD.encode()):
        reset_login_attempts(rate_key)
        session['admin_authed'] = True
        return redirect(url_for('admin.dashboard'))
    record_login_fail(rate_key)
    record_login_fail(ADMIN_ALL, limit=30, lock=900)
    return render_template('admin/login.html', error='密码错误')


@admin_bp.route('/logout')
def logout():
    session.pop('admin_authed', None)
    return redirect(url_for('admin.login'))


# ── overview, feedback, reports ───────────────────────────────


@admin_bp.route('/dashboard')
@login_required
def dashboard():
    counts = {}
    with get_db() as conn:
        cur = conn.cursor()
        for key, sql in (
            ('users', 'SELECT COUNT(*) AS c FROM users'),
            ('rooms', 'SELECT COUNT(*) AS c FROM rooms'),
            ('messages', 'SELECT COUNT(*) AS c FROM messages WHERE recalled IS NOT TRUE'),
            ('feedback', 'SELECT COUNT(*) AS c FROM feedback'),
            ('reports', 'SELECT COUNT(*) AS c FROM reports'),
        ):
            cur.execute(sql)
            counts[key] = cur.fetchone()['c']
        image_bytes = images.storage(cur)
    return render_template(
        'admin/dashboard.html', section='dashboard', online=len(online_users), image_bytes=image_bytes, **counts
    )


@admin_bp.route('/feedback')
@login_required
def feedback():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, username, text, created_at FROM feedback ORDER BY created_at DESC LIMIT 300')
        rows = cur.fetchall()
    return render_template('admin/feedback.html', section='feedback', rows=rows)


@admin_bp.route('/feedback/<int:fid>/delete', methods=['POST'])
@login_required
def delete_feedback(fid):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM feedback WHERE id = %s', (fid,))
        conn.commit()
    return redirect(url_for('admin.feedback'))


@admin_bp.route('/reports')
@login_required
def reports():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT id, reporter, reported, reason, created_at, match_id FROM reports ORDER BY created_at DESC LIMIT 300'
        )
        rows = cur.fetchall()
    return render_template('admin/reports.html', section='reports', rows=rows)


@admin_bp.route('/reports/<int:rid>/delete', methods=['POST'])
@login_required
def delete_report(rid):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM reports WHERE id = %s', (rid,))
        conn.commit()
    return redirect(url_for('admin.reports'))


@admin_bp.route('/matches/<int:match_id>')
@login_required
def match_transcript(match_id):
    """A random match's transcript with real identities (kept 7 days, for reports)."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM matches WHERE id = %s', (match_id,))
        match = cur.fetchone()
        cur.execute(
            'SELECT username, text, created_at FROM messages WHERE room = %s ORDER BY id', (f'match:{match_id}',)
        )
        messages = cur.fetchall()
    return render_template('admin/match.html', section='reports', match_id=match_id, match=match, messages=messages)


@admin_bp.route('/turn')
@login_required
def turn():
    """Voice relay usage, as the TURN host reports it (see turn_usage.py)."""
    page = _page_number()
    with get_db() as conn:
        cur = conn.cursor()
        stats = turn_usage.overview(cur)
        sessions, total = turn_usage.recent(cur, PER_PAGE, (page - 1) * PER_PAGE)
    return render_template(
        'admin/turn.html',
        section='turn',
        stats=stats,
        sessions=sessions,
        total=total,
        page=page,
        per_page=PER_PAGE,
        page_url=lambda n: url_for('admin.turn', page=n),
    )


# ── users ─────────────────────────────────────────────────────


@admin_bp.route('/users')
@login_required
def users():
    q = request.args.get('q', '').strip()
    page = _page_number()
    where, params = ('WHERE username ILIKE %s OR screenname ILIKE %s', (f'%{q}%', f'%{q}%')) if q else ('', ())
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f'SELECT COUNT(*) AS c FROM users {where}', params)
        total = cur.fetchone()['c']
        cur.execute(
            f'SELECT username, screenname, bio FROM users {where} ORDER BY username LIMIT %s OFFSET %s',
            (*params, PER_PAGE, (page - 1) * PER_PAGE),
        )
        rows = cur.fetchall()
    return render_template(
        'admin/users.html',
        section='users',
        q=q,
        rows=rows,
        total=total,
        page=page,
        per_page=PER_PAGE,
        page_url=lambda n: url_for('admin.users', q=q or None, page=n),
    )


@admin_bp.route('/users/<username>/reset-password', methods=['POST'])
@login_required
def reset_user_password(username):
    new_password = (request.form.get('new_password') or '').strip()
    if len(new_password) < MIN_PASSWORD_LEN:
        return _back(url_for('admin.users'), error=f'密码至少{MIN_PASSWORD_LEN}位')
    with get_db() as conn:
        cur = conn.cursor()
        # Accounts made with GitHub or Google have one now too
        cur.execute(
            'UPDATE users SET password = %s, has_password = TRUE WHERE username = %s RETURNING username',
            (hash_password(new_password), username),
        )
        found = cur.fetchone()
        conn.commit()
    if not found:
        return _back(url_for('admin.users'), error=f'没有用户 {username}')
    end_sessions(username)  # their old sessions stop working: sign every device out now
    return _back(url_for('admin.users'), ok=f'已重置 {username} 的密码')


@admin_bp.route('/users/<username>/rename', methods=['POST'])
@login_required
def rename_user(username):
    new = (request.form.get('new_username') or '').strip().lower()
    error = moderation.rename_user(username, new)
    if error:
        return _back(url_for('admin.users'), error=error)
    return _back(url_for('admin.users', q=new), ok=f'{username} 已改名为 {new}')


@admin_bp.route('/users/<username>/delete', methods=['POST'])
@login_required
def delete_user(username):
    with get_db() as conn:
        cur = conn.cursor()
        moderation.delete_account(cur, username)
        conn.commit()
    end_sessions(username)
    return redirect(url_for('admin.users'))


# ── rooms ─────────────────────────────────────────────────────


@admin_bp.route('/rooms')
@login_required
def rooms():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT name, owner, code, password, invite_only, array_length(members, 1) AS member_count'
            ' FROM rooms ORDER BY name'
        )
        rows = cur.fetchall()
    return render_template('admin/rooms.html', section='rooms', rows=rows, lobby=LOBBY)


@admin_bp.route('/rooms/<path:room_name>/detail')
@login_required
def room_detail(room_name):
    page = _page_number()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room_name,))
        room = cur.fetchone()
        if not room:
            return redirect(url_for('admin.rooms'))
        member_names, kicked_names = list(room['members'] or []), list(room.get('kicked') or [])
        cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)', (member_names + kicked_names,))
        screennames = {r['username']: r['screenname'] for r in cur.fetchall()}
        cur.execute('SELECT COUNT(*) AS c FROM messages WHERE room = %s', (room_name,))
        message_total = cur.fetchone()['c']
        cur.execute(
            'SELECT id, username, screenname, text, recalled, edited, created_at, system FROM messages'
            ' WHERE room = %s ORDER BY created_at DESC LIMIT %s OFFSET %s',
            (room_name, PER_PAGE, (page - 1) * PER_PAGE),
        )
        messages = list(reversed(cur.fetchall()))
        log_entries, _ = room_log.page(cur, room_name)

    muted = set(moderation.restricted_users(room_name, moderation.TEXT))
    voice_banned = set(moderation.restricted_users(room_name, moderation.VOICE))
    owner, admins = room.get('owner') or '', set(room['admins'] or [])
    members = [
        {
            'username': u,
            'screenname': screennames.get(u, ''),
            'online': u in online_users,
            'role': '房主' if u == owner else '管理员' if u in admins else '',
            'muted': u in muted,
            'voice_banned': u in voice_banned,
        }
        for u in member_names
    ]
    kicked = [{'username': u, 'screenname': screennames.get(u, '')} for u in kicked_names]
    return render_template(
        'admin/room.html',
        section='rooms',
        room=room,
        members=members,
        kicked=kicked,
        messages=messages,
        message_total=message_total,
        log=log_entries,
        log_labels=LOG_LABELS,
        mute_options=MUTE_OPTIONS,
        page=page,
        per_page=PER_PAGE,
        page_url=lambda n: url_for('admin.room_detail', room_name=room_name, page=n),
        # Where the forms bring the browser back to
        here=url_for('admin.room_detail', room_name=room_name, page=page if page > 1 else None),
    )


@admin_bp.route('/rooms/<path:room_name>/kick', methods=['POST'])
@login_required
def kick_member(room_name):
    username = _form_user()
    moderation.kick(room_name, username)
    room_log.record(room_name, room_log.SITE_ADMIN, 'kick', username)
    return _back(ok=f'已把 {username} 踢出 {room_name}')


@admin_bp.route('/rooms/<path:room_name>/unkick', methods=['POST'])
@login_required
def unkick_member(room_name):
    username = _form_user()
    moderation.unkick(room_name, username)
    room_log.record(room_name, room_log.SITE_ADMIN, 'unkick', username)
    return _back(ok=f'{username} 可以重新加入 {room_name} 了')


@admin_bp.route('/rooms/<path:room_name>/restrict', methods=['POST'])
@login_required
def restrict_member(room_name):
    username, kind = _form_user(), _form_kind()
    duration = request.form.get('duration', 0, type=int) or 0
    moderation.restrict(room_name, username, kind, duration)
    action = 'mute' if kind == moderation.TEXT else 'voice_ban'
    room_log.record(room_name, room_log.SITE_ADMIN, action, username, duration=duration)
    return _back(ok=f'已对 {username} {RESTRICTION_LABELS[kind]}')


@admin_bp.route('/rooms/<path:room_name>/lift', methods=['POST'])
@login_required
def lift_restriction(room_name):
    username, kind = _form_user(), _form_kind()
    moderation.lift(room_name, username, kind)
    action = 'unmute' if kind == moderation.TEXT else 'voice_unban'
    room_log.record(room_name, room_log.SITE_ADMIN, action, username)
    return _back(ok=f'已解除 {username} 的{RESTRICTION_LABELS[kind]}')


@admin_bp.route('/messages/<int:msg_id>/recall', methods=['POST'])
@login_required
def recall_message(msg_id):
    moderation.recall(msg_id)
    return _back(ok='消息已撤回')


@admin_bp.route('/rooms/<path:room_name>/close', methods=['POST'])
@login_required
def close_room(room_name):
    if room_name != LOBBY:
        moderation.close_room(room_name)
    return redirect(url_for('admin.rooms'))

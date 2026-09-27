import os
import functools
import hmac
import logging
from flask import Blueprint, request, redirect, url_for, session, make_response
from db import get_db
from urllib.parse import quote
from utils import hash_password
from state import check_login_rate, record_login_fail, reset_login_attempts, online_users, LOBBY
import moderation
from moderation import delete_account

log = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')

# ── HTML helpers ──────────────────────────────────────────────

CSS = '''
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #f0f0f3; color: #222; font-size: 14px; }
a { color: #4f8ef7; text-decoration: none; }
.topbar { background: #fff; border-bottom: 1px solid #e0e0e6; padding: 0 28px; height: 52px;
          display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
.topbar h1 { font-size: 18px; font-weight: 700; color: #4f8ef7; margin-right: 20px; }
.topbar-left { display: flex; align-items: center; }
nav a { color: #555; padding: 7px 11px; border-radius: 7px; font-size: 13px; font-weight: 500; }
nav a:hover { background: #f0f0f3; }
nav a.active { background: #e8f0fe; color: #4f8ef7; }
.content { max-width: 1100px; margin: 28px auto; padding: 0 20px; }
h2 { font-size: 20px; font-weight: 700; margin-bottom: 20px; }
.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; }
.stat { background: #fff; border-radius: 12px; padding: 18px; border: 1px solid #e0e0e6; text-align: center; }
.stat-num { font-size: 30px; font-weight: 700; color: #4f8ef7; }
.stat-label { font-size: 12px; color: #888; margin-top: 4px; }
.card { background: #fff; border-radius: 12px; border: 1px solid #e0e0e6; overflow: hidden; margin-bottom: 20px; }
.card-header { padding: 14px 18px; border-bottom: 1px solid #f0f0f3; font-weight: 600; font-size: 15px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 9px 14px; color: #888; font-size: 11px; font-weight: 600; text-transform: uppercase;
     letter-spacing: .04em; border-bottom: 1px solid #f0f0f3; background: #fafafa; }
td { padding: 11px 14px; border-bottom: 1px solid #f8f8f8; vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafbff; }
.btn { display: inline-block; padding: 5px 13px; border-radius: 7px; font-size: 12px; font-weight: 600;
       cursor: pointer; border: none; font-family: inherit; }
.btn-primary { background: #4f8ef7; color: #fff; }
.btn-danger { background: #ED4245; color: #fff; }
.btn-ghost { background: #f0f0f3; color: #555; }
.btn:hover { opacity: .85; }
.search-row { display: flex; gap: 8px; margin-bottom: 16px; }
input[type=text], input[type=password], input[type=search] {
  padding: 8px 12px; border: 1px solid #e0e0e6; border-radius: 8px; font-size: 14px; outline: none; width: 260px; }
input:focus { border-color: #4f8ef7; }
form.inline { display: inline; }
.tag { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.tag-blue { background: #e8f0fe; color: #4f8ef7; }
.tag-red { background: #fde8e8; color: #ED4245; }
.pre { white-space: pre-wrap; word-break: break-all; max-width: 500px; line-height: 1.5; }
.mono { font-family: monospace; font-size: 12px; color: #888; }
.logout { color: #888; font-size: 13px; }
.logout:hover { color: #ED4245; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; align-items: center; justify-content: center; }
.modal-overlay.open { display: flex; }
.modal { background: #fff; border-radius: 14px; padding: 28px; width: 360px; }
.modal h3 { font-size: 17px; font-weight: 700; margin-bottom: 16px; }
.modal input { width: 100%; margin-bottom: 14px; }
.modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
.notice { padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 13px; }
.notice-ok { background: #e7f6ec; color: #1f7a3d; }
.notice-err { background: #fdecec; color: #b3261e; }
select { padding: 5px 8px; border: 1px solid #e0e0e6; border-radius: 7px; font-size: 13px; }
'''

TOPBAR = '''
<div class="topbar">
  <div class="topbar-left">
    <h1>Reco Admin</h1>
    <nav>
      <a href="/admin/dashboard" class="{d}">概览</a>
      <a href="/admin/feedback" class="{fb}">反馈</a>
      <a href="/admin/reports" class="{rp}">举报</a>
      <a href="/admin/users" class="{us}">用户</a>
      <a href="/admin/rooms" class="{rm}">房间</a>
    </nav>
  </div>
  <a href="/admin/logout" class="logout">退出</a>
</div>
'''

def page(body, active=''):
    nav = {k: '' for k in ['d', 'fb', 'rp', 'us', 'rm']}
    nav[active] = 'active'
    topbar = TOPBAR.format(**nav)
    return f'<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reco Admin</title><style>{CSS}</style></head><body>{topbar}<div class="content">{body}</div></body></html>'


LOGIN_EXTRA_CSS = '''
body { display: flex; align-items: center; justify-content: center; height: 100vh; }
.box { background: #fff; border-radius: 16px; padding: 40px; width: 320px; border: 1px solid #e0e0e6; }
.box h1 { font-size: 22px; font-weight: 700; color: #4f8ef7; margin-bottom: 24px; }
.box input { display: block; width: 100%; margin-bottom: 12px; padding: 10px 14px;
             border: 1px solid #e0e0e6; border-radius: 8px; font-size: 14px; outline: none; }
.box input:focus { border-color: #4f8ef7; }
.box button { width: 100%; padding: 11px; background: #4f8ef7; color: #fff; border: none;
              border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
.err { color: #ED4245; font-size: 13px; margin-bottom: 10px; }
'''


def login_page(error=''):
    err_html = f'<p class="err">{_esc(error)}</p>' if error else ''
    return (
        '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Reco Admin</title>'
        f'<style>{CSS}{LOGIN_EXTRA_CSS}</style></head><body>'
        '<div class="box"><h1>Reco Admin</h1>'
        f'{err_html}'
        '<form method="post">'
        '<input type="password" name="password" placeholder="管理员密码" autofocus>'
        '<button type="submit">登录</button>'
        '</form></div></body></html>'
    )


def login_required(f):
    @functools.wraps(f)
    def inner(*a, **kw):
        if not session.get('admin_authed'):
            return redirect(url_for('admin.login'))
        return f(*a, **kw)
    return inner


# ── Auth ──────────────────────────────────────────────────────

@admin_bp.route('/')
def index():
    return redirect(url_for('admin.dashboard'))


@admin_bp.route('/login', methods=['GET', 'POST'])
def login():
    if not ADMIN_PASSWORD:
        return login_page('后台未启用：服务器没有设置 ADMIN_PASSWORD'), 503
    if request.method == 'POST':
        # Render sits behind a proxy; the first X-Forwarded-For hop is the client
        ip = (request.headers.get('X-Forwarded-For') or request.remote_addr or '').split(',')[0].strip()
        rate_key = f'admin-login:{ip}'
        allowed, secs = check_login_rate(rate_key)
        if not allowed:
            return login_page(f'尝试过多，请 {secs} 秒后重试'), 429
        if hmac.compare_digest((request.form.get('password') or '').encode(), ADMIN_PASSWORD.encode()):
            reset_login_attempts(rate_key)
            session['admin_authed'] = True
            return redirect(url_for('admin.dashboard'))
        record_login_fail(rate_key)
        return login_page('密码错误')
    return login_page()


@admin_bp.route('/logout')
def logout():
    session.pop('admin_authed', None)
    return redirect(url_for('admin.login'))


# ── Dashboard ─────────────────────────────────────────────────

@admin_bp.route('/dashboard')
@login_required
def dashboard():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) AS c FROM users')
        users = cur.fetchone()['c']
        cur.execute('SELECT COUNT(*) AS c FROM rooms')
        rooms = cur.fetchone()['c']
        cur.execute('SELECT COUNT(*) AS c FROM messages WHERE recalled IS NOT TRUE')
        messages = cur.fetchone()['c']
        cur.execute('SELECT COUNT(*) AS c FROM feedback')
        feedbacks = cur.fetchone()['c']
        cur.execute('SELECT COUNT(*) AS c FROM reports')
        reports = cur.fetchone()['c']

    from state import online_users
    online = len(online_users)

    body = f'''
    <h2>概览</h2>
    <div class="stats">
      <div class="stat"><div class="stat-num">{online}</div><div class="stat-label">当前在线</div></div>
      <div class="stat"><div class="stat-num">{users}</div><div class="stat-label">注册用户</div></div>
      <div class="stat"><div class="stat-num">{rooms}</div><div class="stat-label">聊天室</div></div>
      <div class="stat"><div class="stat-num">{messages}</div><div class="stat-label">消息总数</div></div>
      <div class="stat"><div class="stat-num">{feedbacks}</div><div class="stat-label">用户反馈</div></div>
      <div class="stat"><div class="stat-num">{reports}</div><div class="stat-label">举报记录</div></div>
    </div>'''
    return page(body, 'd')


# ── Feedback ──────────────────────────────────────────────────

@admin_bp.route('/feedback')
@login_required
def feedback():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, username, text, created_at FROM feedback ORDER BY created_at DESC LIMIT 300')
        rows = cur.fetchall()

    rows_html = ''
    for r in rows:
        ts = r['created_at'].strftime('%Y-%m-%d %H:%M') if r.get('created_at') else ''
        rows_html += f'''<tr>
          <td class="mono">{_esc(r["username"])}</td>
          <td><div class="pre">{_esc(r["text"])}</div></td>
          <td class="mono">{ts}</td>
          <td>
            <form class="inline" method="post" action="/admin/feedback/{r["id"]}/delete"
                  onsubmit="return confirm('删除这条反馈？')">
              <button class="btn btn-danger">删除</button>
            </form>
          </td></tr>'''

    body = f'''
    <h2>用户反馈 <span style="font-size:14px;font-weight:400;color:#888">共 {len(rows)} 条</span></h2>
    <div class="card">
      <table>
        <tr><th>用户</th><th>内容</th><th>时间</th><th></th></tr>
        {rows_html or "<tr><td colspan='4' style='color:#aaa;text-align:center;padding:30px'>暂无反馈</td></tr>"}
      </table>
    </div>'''
    return page(body, 'fb')


@admin_bp.route('/feedback/<int:fid>/delete', methods=['POST'])
@login_required
def delete_feedback(fid):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM feedback WHERE id = %s', (fid,))
        conn.commit()
    return redirect(url_for('admin.feedback'))


# ── Reports ───────────────────────────────────────────────────

@admin_bp.route('/reports')
@login_required
def reports():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id, reporter, reported, reason, created_at FROM reports ORDER BY created_at DESC LIMIT 300')
        rows = cur.fetchall()

    rows_html = ''
    for r in rows:
        ts = r['created_at'].strftime('%Y-%m-%d %H:%M') if r.get('created_at') else ''
        rows_html += f'''<tr>
          <td class="mono">{_esc(r["reporter"])}</td>
          <td class="mono"><a href="/admin/users?q={_url(r["reported"])}">{_esc(r["reported"])}</a></td>
          <td>{_esc(r["reason"] or "")}</td>
          <td class="mono">{ts}</td>
          <td>
            <form class="inline" method="post" action="/admin/reports/{r["id"]}/delete"
                  onsubmit="return confirm('删除这条举报？')">
              <button class="btn btn-danger">删除</button>
            </form>
          </td></tr>'''

    body = f'''
    <h2>举报记录 <span style="font-size:14px;font-weight:400;color:#888">共 {len(rows)} 条</span></h2>
    <div class="card">
      <table>
        <tr><th>举报人</th><th>被举报</th><th>原因</th><th>时间</th><th></th></tr>
        {rows_html or "<tr><td colspan='5' style='color:#aaa;text-align:center;padding:30px'>暂无举报</td></tr>"}
      </table>
    </div>'''
    return page(body, 'rp')


@admin_bp.route('/reports/<int:rid>/delete', methods=['POST'])
@login_required
def delete_report(rid):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM reports WHERE id = %s', (rid,))
        conn.commit()
    return redirect(url_for('admin.reports'))


# ── Users ─────────────────────────────────────────────────────

PER_PAGE = 50

@admin_bp.route('/users')
@login_required
def users():
    q = request.args.get('q', '').strip()
    p = max(1, int(request.args.get('page', 1)))
    offset = (p - 1) * PER_PAGE
    with get_db() as conn:
        cur = conn.cursor()
        where = 'WHERE username ILIKE %s OR screenname ILIKE %s' if q else ''
        params_count = (f'%{q}%', f'%{q}%') if q else ()
        cur.execute(f'SELECT COUNT(*) AS c FROM users {where}', params_count)
        total = cur.fetchone()['c']
        cur.execute(
            f'SELECT username, screenname, bio FROM users {where}'
            f' ORDER BY username LIMIT %s OFFSET %s',
            (*params_count, PER_PAGE, offset)
        )
        rows = cur.fetchall()

    rows_html = ''
    for r in rows:
        uname = _esc(r['username'])
        rows_html += (
            f'<tr><td class="mono">{uname}</td>'
            f'<td>{_esc(r["screenname"] or "")}</td>'
            f'<td style="color:#888">{_esc(r["bio"] or "")}</td>'
            f'<td>'
            f'<button class="btn btn-ghost" data-u="{uname}" onclick="openReset(this.dataset.u)">重置密码</button> '
            f'<button class="btn btn-ghost" data-u="{uname}" onclick="openRename(this.dataset.u)">改用户名</button> '
            f'<form class="inline" method="post" action="/admin/users/{_url(r["username"])}/delete"'
            f' data-u="{uname}" onsubmit="return confirm(\'永久删除用户 \' + this.dataset.u + \'？\')">'
            f'<button class="btn btn-danger">删除</button></form>'
            f'</td></tr>'
        )

    empty = "<tr><td colspan='4' style='color:#aaa;text-align:center;padding:30px'>未找到用户</td></tr>"
    base = f'/admin/users?q={_esc(q)}' if q else '/admin/users'
    pagination = _pages(total, p, PER_PAGE, base)

    body = f'''
    {_notice()}
    <h2>用户管理 <span style="font-size:14px;font-weight:400;color:#888">共 {total} 个用户</span></h2>
    <form class="search-row" method="get">
      <input type="search" name="q" value="{_esc(q)}" placeholder="搜索用户名或显示名…">
      <button class="btn btn-primary" type="submit">搜索</button>
      {"" if not q else '<a href="/admin/users" class="btn btn-ghost">清除</a>'}
    </form>
    <div class="card">
      <table>
        <tr><th>用户名</th><th>显示名</th><th>简介</th><th></th></tr>
        {rows_html or empty}
      </table>
    </div>
    {pagination}
    <div class="modal-overlay" id="reset-modal">
      <div class="modal">
        <h3>重置密码</h3>
        <form method="post" id="reset-form" action="">
          <input type="text" name="new_password" id="new_pw" placeholder="新密码（至少6位）" autocomplete="off">
          <div class="modal-btns">
            <button type="button" class="btn btn-ghost" onclick="closeReset()">取消</button>
            <button type="submit" class="btn btn-primary">确认重置</button>
          </div>
        </form>
      </div>
    </div>
    <div class="modal-overlay" id="rename-modal">
      <div class="modal">
        <h3>修改用户名</h3>
        <p style="color:#888;font-size:13px;margin-bottom:12px">3-20 位小写字母、数字或下划线。该用户会被登出，需要用新用户名重新登录；旧用户名将永久停用。</p>
        <form method="post" id="rename-form" action="">
          <input type="text" name="new_username" id="new_username" placeholder="新用户名" autocomplete="off">
          <div class="modal-btns">
            <button type="button" class="btn btn-ghost" onclick="closeModal('rename-modal')">取消</button>
            <button type="submit" class="btn btn-primary">确认修改</button>
          </div>
        </form>
      </div>
    </div>
    <script>
    function openRename(u) {{
      document.getElementById('rename-form').action = '/admin/users/' + encodeURIComponent(u) + '/rename';
      document.getElementById('new_username').value = '';
      document.getElementById('rename-modal').classList.add('open');
      setTimeout(() => document.getElementById('new_username').focus(), 50);
    }}
    function closeModal(id) {{ document.getElementById(id).classList.remove('open'); }}
    document.getElementById('rename-modal').addEventListener('click', function(e) {{
      if (e.target === this) closeModal('rename-modal');
    }});
    function openReset(u) {{
      document.getElementById('reset-form').action = '/admin/users/' + encodeURIComponent(u) + '/reset-password';
      document.getElementById('new_pw').value = '';
      document.getElementById('reset-modal').classList.add('open');
      setTimeout(() => document.getElementById('new_pw').focus(), 50);
    }}
    function closeReset() {{ document.getElementById('reset-modal').classList.remove('open'); }}
    document.getElementById('reset-modal').addEventListener('click', function(e) {{
      if (e.target === this) closeReset();
    }});
    </script>'''
    return page(body, 'us')


@admin_bp.route('/users/<username>/reset-password', methods=['POST'])
@login_required
def reset_user_password(username):
    new_pw = (request.form.get('new_password') or '').strip()
    if len(new_pw) < 6:
        return _back(url_for('admin.users'), error='密码至少6位')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE users SET password = %s WHERE username = %s',
                    (hash_password(new_pw), username))
        conn.commit()
    return _back(url_for('admin.users'), ok=f'已重置 {username} 的密码')


@admin_bp.route('/users/<username>/rename', methods=['POST'])
@login_required
def rename_user(username):
    new = (request.form.get('new_username') or '').strip().lower()
    error = moderation.rename_user(username, new)
    if error:
        return _back(url_for('admin.users'), error=error)
    return _back(url_for('admin.users') + f'?q={_url(new)}', ok=f'{username} 已改名为 {new}')


@admin_bp.route('/users/<username>/delete', methods=['POST'])
@login_required
def delete_user(username):
    with get_db() as conn:
        cur = conn.cursor()
        delete_account(cur, username)
        conn.commit()
    return redirect(url_for('admin.users'))


# ── Rooms ─────────────────────────────────────────────────────

@admin_bp.route('/rooms')
@login_required
def rooms():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT name, owner, code, password, array_length(members,1) AS mc,'
                    ' array_length(admins,1) AS ac FROM rooms ORDER BY name')
        rows = cur.fetchall()

    from state import online_users
    rows_html = ''
    for r in rows:
        mc = r['mc'] or 0
        pw = '🔒' if r.get('password') else ''
        rname = _esc(r['name'])
        close_btn = '' if r['name'] == LOBBY else (
            f'<form class="inline" method="post" action="/admin/rooms/{_url(r["name"])}/close"'
            f' data-name="{rname}" onsubmit="return confirm(\'关闭房间 \' + this.dataset.name + \'？将删除所有消息。\')">'
            '<button class="btn btn-danger">关闭</button></form>'
        )
        rows_html += (
            f'<tr><td><b>{rname}</b> {pw}</td>'
            f'<td class="mono">{r["code"] or ""}</td>'
            f'<td class="mono">{r["owner"] or ""}</td>'
            f'<td>{mc}</td>'
            f'<td><a href="/admin/rooms/{_url(r["name"])}/detail" class="btn btn-ghost">详情</a> {close_btn}</td></tr>'
        )

    body = f'''
    <h2>聊天室 <span style="font-size:14px;font-weight:400;color:#888">共 {len(rows)} 个</span></h2>
    <div class="card">
      <table>
        <tr><th>名称</th><th>房间号</th><th>房主</th><th>成员数</th><th></th></tr>
        {rows_html or "<tr><td colspan='5' style='color:#aaa;text-align:center;padding:30px'>暂无房间</td></tr>"}
      </table>
    </div>'''
    return page(body, 'rm')


MUTE_OPTIONS = [(600, '10 分钟'), (3600, '1 小时'), (86400, '1 天'), (0, '永久')]


@admin_bp.route('/rooms/<path:room_name>/detail')
@login_required
def room_detail(room_name):
    p = max(1, int(request.args.get('page', 1)))
    offset = (p - 1) * PER_PAGE
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM rooms WHERE name = %s', (room_name,))
        room = cur.fetchone()
        if not room:
            return redirect(url_for('admin.rooms'))
        members = list(room['members'] or [])
        kicked = list(room.get('kicked') or [])
        cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)', (members + kicked,))
        user_map = {r['username']: r for r in cur.fetchall()}
        cur.execute('SELECT COUNT(*) AS c FROM messages WHERE room = %s', (room_name,))
        msg_total = cur.fetchone()['c']
        cur.execute(
            'SELECT id, username, screenname, text, recalled, edited, created_at, system'
            ' FROM messages WHERE room = %s ORDER BY created_at DESC LIMIT %s OFFSET %s',
            (room_name, PER_PAGE, offset)
        )
        msgs = list(reversed(cur.fetchall()))

    admins_set = set(room['admins'] or [])
    owner = room.get('owner') or ''
    base = f'/admin/rooms/{_url(room_name)}'
    here = f'{base}/detail' + (f'?page={p}' if p > 1 else '')

    def action(path, label, fields=None, danger=False, confirm=None):
        hidden = ''.join(f'<input type="hidden" name="{k}" value="{_esc(v)}">' for k, v in (fields or {}).items())
        guard = ' onsubmit="return confirm(this.dataset.confirm)"' if confirm else ''
        data = f' data-confirm="{_esc(confirm)}"' if confirm else ''
        cls = 'btn-danger' if danger else 'btn-ghost'
        return (f'<form class="inline" method="post" action="{path}"{guard}{data}>{hidden}'
                f'<input type="hidden" name="next" value="{_esc(here)}">'
                f'<button class="btn {cls}">{label}</button></form>')

    text_muted = set(moderation.restricted_users(room_name, moderation.TEXT))
    voice_banned = set(moderation.restricted_users(room_name, moderation.VOICE))

    def restrict_control(u, kind, active, label):
        if active:
            return action(f'{base}/lift', f'解除{label}', {'username': u, 'kind': kind})
        options = ''.join(f'<option value="{secs}">{text}</option>' for secs, text in MUTE_OPTIONS)
        return (f'<form class="inline" method="post" action="{base}/restrict">'
                f'<input type="hidden" name="username" value="{_esc(u)}">'
                f'<input type="hidden" name="kind" value="{kind}">'
                f'<input type="hidden" name="next" value="{_esc(here)}">'
                f'<select name="duration">{options}</select> <button class="btn btn-ghost">{label}</button></form>')

    members_html = ''
    for u in members:
        info = user_map.get(u, {})
        role = '房主' if u == owner else ('管理员' if u in admins_set else '')
        online_dot = '🟢' if u in online_users else '⚪'
        role_html = f'<span class="tag tag-blue">{role}</span>' if role else ''
        muted_html = ((' <span class="tag">禁言中</span>' if u in text_muted else '')
                      + (' <span class="tag">语音禁言中</span>' if u in voice_banned else ''))
        members_html += (
            f'<tr><td>{online_dot} <span class="mono">{_esc(u)}</span></td>'
            f'<td>{_esc(info.get("screenname", ""))}</td>'
            f'<td>{role_html}{muted_html}</td>'
            f'<td style="white-space:nowrap">{restrict_control(u, moderation.TEXT, u in text_muted, "禁言")}<br>'
            f'{restrict_control(u, moderation.VOICE, u in voice_banned, "语音禁言")} '
            f'{action(f"{base}/kick", "踢出", {"username": u}, danger=True, confirm=f"把 {u} 踢出房间？踢出后无法再加入，直到解封。")}'
            f'</td></tr>'
        )

    kicked_html = ''.join(
        f'<tr><td class="mono">{_esc(u)}</td><td>{_esc(user_map.get(u, {}).get("screenname", ""))}</td>'
        f'<td>{action(f"{base}/unkick", "解封", {"username": u})}</td></tr>'
        for u in kicked
    )
    kicked_card = f'''
        <div class="card" style="margin-top:16px">
          <div class="card-header">已踢出 ({len(kicked)})</div>
          <table><tr><th>用户名</th><th>显示名</th><th></th></tr>{kicked_html}</table>
        </div>''' if kicked else ''

    msgs_html = ''
    for m in msgs:
        ts = m['created_at'].strftime('%m-%d %H:%M') if m.get('created_at') else ''
        text = m['text'] or ''
        if m.get('recalled'):
            text = '<span style="color:#aaa">（已撤回）</span>'
        else:
            text = _esc(text)
            if m.get('edited'):
                text += ' <span style="color:#aaa;font-size:11px">(已编辑)</span>'
        recall_btn = '' if m.get('recalled') or m.get('system') else action(
            f'/admin/messages/{m["id"]}/recall', '撤回', danger=True, confirm='撤回这条消息？')
        style = 'color:#aaa' if m.get('system') else ''
        msgs_html += (
            f'<tr style="{style}"><td class="mono">{ts}</td>'
            f'<td class="mono">{_esc(m["screenname"] or m["username"])}</td>'
            f'<td>{text}</td><td>{recall_btn}</td></tr>'
        )

    msg_pagination = _pages(msg_total, p, PER_PAGE, f'{base}/detail')
    body = f'''
    {_notice()}
    <p style="margin-bottom:16px"><a href="/admin/rooms">← 返回房间列表</a></p>
    <h2>{_esc(room_name)}</h2>
    <div style="display:grid;grid-template-columns:minmax(420px,auto) 1fr;gap:16px;align-items:start">
      <div>
        <div class="card">
          <div class="card-header">成员 ({len(members)})</div>
          <table>
            <tr><th>用户名</th><th>显示名</th><th>状态</th><th></th></tr>
            {members_html or "<tr><td colspan='4' style='color:#aaa;padding:20px;text-align:center'>暂无成员</td></tr>"}
          </table>
        </div>
        {kicked_card}
      </div>
      <div>
        <div class="card">
          <div class="card-header">消息记录（共 {msg_total} 条）</div>
          <table>
            <tr><th>时间</th><th>发送者</th><th>内容</th><th></th></tr>
            {msgs_html or "<tr><td colspan='4' style='color:#aaa;padding:20px;text-align:center'>暂无消息</td></tr>"}
          </table>
        </div>
        {msg_pagination}
      </div>
    </div>'''
    return page(body, 'rm')


def _form_user():
    return (request.form.get('username') or '').strip()


@admin_bp.route('/rooms/<path:room_name>/kick', methods=['POST'])
@login_required
def kick_member(room_name):
    u = _form_user()
    moderation.kick(room_name, u)
    return _back(ok=f'已把 {u} 踢出 {room_name}')


@admin_bp.route('/rooms/<path:room_name>/unkick', methods=['POST'])
@login_required
def unkick_member(room_name):
    u = _form_user()
    moderation.unkick(room_name, u)
    return _back(ok=f'{u} 可以重新加入 {room_name} 了')


RESTRICTION_LABELS = {moderation.TEXT: '禁言', moderation.VOICE: '语音禁言'}


def _form_kind():
    kind = request.form.get('kind')
    return kind if kind in RESTRICTION_LABELS else moderation.TEXT


@admin_bp.route('/rooms/<path:room_name>/restrict', methods=['POST'])
@login_required
def restrict_member(room_name):
    u, kind = _form_user(), _form_kind()
    moderation.restrict(room_name, u, kind, int(request.form.get('duration', 0)))
    return _back(ok=f'已对 {u} {RESTRICTION_LABELS[kind]}')


@admin_bp.route('/rooms/<path:room_name>/lift', methods=['POST'])
@login_required
def lift_restriction(room_name):
    u, kind = _form_user(), _form_kind()
    moderation.lift(room_name, u, kind)
    return _back(ok=f'已解除 {u} 的{RESTRICTION_LABELS[kind]}')


@admin_bp.route('/messages/<int:msg_id>/recall', methods=['POST'])
@login_required
def recall_message(msg_id):
    moderation.recall(msg_id)
    return _back(ok='消息已撤回')


@admin_bp.route('/rooms/<path:room_name>/close', methods=['POST'])
@login_required
def close_room(room_name):
    if room_name == LOBBY:
        return redirect(url_for('admin.rooms'))
    from extensions import socketio
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DELETE FROM messages WHERE room = %s', (room_name,))
        cur.execute('DELETE FROM rooms WHERE name = %s', (room_name,))
        conn.commit()
    socketio.emit('room_closed', {}, to=room_name)
    return redirect(url_for('admin.rooms'))


# ── Util ──────────────────────────────────────────────────────

def _esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;').replace("'", '&#39;'))


def _back(default=None, ok=None, error=None):
    """Redirect to the form's `next` (admin pages only) or `default`, carrying a notice."""
    target = request.form.get('next') or default or url_for('admin.dashboard')
    if not target.startswith('/admin/'):
        target = url_for('admin.dashboard')
    msg = error or ok
    if msg:
        target += ('&' if '?' in target else '?') + ('error=' if error else 'ok=') + quote(msg)
    return redirect(target)


def _notice():
    error, ok = request.args.get('error'), request.args.get('ok')
    if error:
        return f'<div class="notice notice-err">{_esc(error)}</div>'
    if ok:
        return f'<div class="notice notice-ok">{_esc(ok)}</div>'
    return ''


def _url(s):
    """Percent-encode a user-controlled value for use as one URL path segment."""
    return quote(str(s), safe='')


def _pages(total, page, per_page, base_url):
    """Return pagination HTML. base_url should already include ? params except page."""
    total_pages = max(1, (total + per_page - 1) // per_page)
    if total_pages <= 1:
        return ''
    sep = '&' if '?' in base_url else '?'
    parts = [f'<div style="display:flex;gap:6px;align-items:center;margin-top:14px;flex-wrap:wrap">']
    parts.append(f'<span style="color:#888;font-size:13px">第 {page}/{total_pages} 页，共 {total} 条</span>')
    if page > 1:
        parts.append(f'<a href="{base_url}{sep}page=1" class="btn btn-ghost">«</a>')
        parts.append(f'<a href="{base_url}{sep}page={page-1}" class="btn btn-ghost">‹ 上一页</a>')
    if page < total_pages:
        parts.append(f'<a href="{base_url}{sep}page={page+1}" class="btn btn-ghost">下一页 ›</a>')
        parts.append(f'<a href="{base_url}{sep}page={total_pages}" class="btn btn-ghost">»</a>')
    parts.append('</div>')
    return ''.join(parts)

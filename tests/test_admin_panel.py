"""Admin panel: the only place with site-wide moderation powers."""
from conftest import (
    app, create_user, create_room, events, anon_client, connect_as, login, query, get_db,
)


def admin_client():
    web = app.test_client()
    assert web.post('/admin/login', data={'password': 'test-admin'}).status_code == 302
    return web


def join(client, room):
    client.emit('join', {'room': room, 'skip_history': True})
    return events(client, 'join_result')[0]


# ── login ─────────────────────────────────────────────────────

def test_admin_pages_require_login():
    assert app.test_client().get('/admin/users').headers['Location'].endswith('/admin/login')


def test_admin_login_locks_out_after_repeated_failures():
    web = app.test_client()
    for _ in range(10):
        web.post('/admin/login', data={'password': 'wrong'})
    # Even the right password is refused during the lockout
    assert web.post('/admin/login', data={'password': 'test-admin'}).status_code == 429


# ── rename ────────────────────────────────────────────────────

def seed_account_with_history():
    """'admin' owns a room, has DMs with alice (sorts before 'bise') and carol (after)."""
    for u in ('admin', 'alice', 'carol'):
        create_user(u)
    create_room('club', owner='admin', members=['admin', 'alice'], admins=['admin'])
    with get_db() as conn:
        cur = conn.cursor()
        for room in ('dm:admin:alice', 'dm:admin:carol', 'club'):
            cur.execute("INSERT INTO messages (room, username, screenname, text) VALUES (%s, 'admin', 'Me', 'hi')",
                        (room,))
        cur.execute("INSERT INTO blocks (blocker, blocked) VALUES ('admin', 'carol')")
        cur.execute("INSERT INTO dm_closed (username, dm_room) VALUES ('admin', 'dm:admin:carol')")
        conn.commit()


def test_rename_moves_everything_to_the_new_name():
    seed_account_with_history()
    admin_client().post('/admin/users/admin/rename', data={'new_username': 'bise'})

    assert query("SELECT username FROM users ORDER BY username") == [
        {'username': 'alice'}, {'username': 'bise'}, {'username': 'carol'}]
    room = query("SELECT owner, members, admins FROM rooms WHERE name = 'club'")[0]
    assert room == {'owner': 'bise', 'members': ['bise', 'alice'], 'admins': ['bise']}
    # DM ids are sorted pairs, so each is recomputed rather than string-replaced
    rooms = {r['room'] for r in query("SELECT DISTINCT room FROM messages")}
    assert rooms == {'dm:alice:bise', 'dm:bise:carol', 'club'}
    assert query("SELECT DISTINCT username FROM messages") == [{'username': 'bise'}]
    assert query("SELECT blocker FROM blocks") == [{'blocker': 'bise'}]
    assert query("SELECT username, dm_room FROM dm_closed") == [{'username': 'bise', 'dm_room': 'dm:bise:carol'}]


def test_renamed_user_logs_in_with_new_name_and_sees_their_dms():
    seed_account_with_history()
    admin_client().post('/admin/users/admin/rename', data={'new_username': 'bise'})
    bise = connect_as('bise')  # same password as before
    bise.emit('get_dms', {})
    dms = {d['dm_room'] for d in events(bise, 'dms_list')[0]['dms']}
    assert dms == {'dm:alice:bise'}  # the carol DM stays closed, as it was

    alice = connect_as('alice')
    alice.emit('get_dms', {})
    assert [d['other_username'] for d in events(alice, 'dms_list')[0]['dms']] == ['bise']


def test_rename_ends_live_sessions_and_retires_the_old_name():
    seed_account_with_history()
    old_session = connect_as('admin')
    admin_client().post('/admin/users/admin/rename', data={'new_username': 'bise'})
    assert events(old_session, 'session_expired') == [{}]
    old_session.emit('get_rooms', {})
    assert events(old_session, 'auth_required')
    assert query("SELECT username FROM deleted_usernames") == [{'username': 'admin'}]


def test_rename_rejects_taken_or_invalid_names():
    create_user('alice')
    create_user('carol')
    web = admin_client()
    for bad in ('carol', 'Bad:Name', 'system', 'x'):
        resp = web.post('/admin/users/alice/rename', data={'new_username': bad})
        assert 'error=' in resp.headers['Location'], bad
    assert query("SELECT username FROM users ORDER BY username") == [{'username': 'alice'}, {'username': 'carol'}]


# ── room moderation ───────────────────────────────────────────

def test_admin_can_kick_and_unkick_from_the_lobby():
    create_user('troll')
    troll = connect_as('troll')
    assert join(troll, '大厅')['success']
    web = admin_client()

    web.post('/admin/rooms/大厅/kick', data={'username': 'troll'})
    assert events(troll, 'kicked_from_room') == [{'room': '大厅'}]
    assert join(troll, '大厅')['success'] is False

    web.post('/admin/rooms/大厅/unkick', data={'username': 'troll'})
    assert join(troll, '大厅')['success']


def test_admin_mute_blocks_messages_until_unmuted():
    create_user('troll')
    troll = connect_as('troll')
    join(troll, '大厅')
    web = admin_client()

    web.post('/admin/rooms/大厅/mute', data={'username': 'troll', 'duration': '0'})
    assert events(troll, 'text_muted') == [{'target': 'troll', 'duration': 0, 'room': '大厅'}]
    troll.emit('message', {'room': '大厅', 'text': 'spam'})
    assert events(troll, 'text_muted_notify')
    assert query("SELECT * FROM messages WHERE text = 'spam'") == []

    web.post('/admin/rooms/大厅/unmute', data={'username': 'troll'})
    troll.emit('message', {'room': '大厅', 'text': 'sorry'})
    assert query("SELECT text FROM messages WHERE text = 'sorry'") == [{'text': 'sorry'}]


def test_admin_can_recall_any_message():
    create_user('alice')
    alice = connect_as('alice')
    join(alice, '大厅')
    alice.emit('message', {'room': '大厅', 'text': 'oops'})
    alice.get_received()
    msg_id = query("SELECT id FROM messages WHERE text = 'oops'")[0]['id']

    admin_client().post(f'/admin/messages/{msg_id}/recall')
    assert events(alice, 'message_recalled') == [{'id': msg_id, 'room': '大厅'}]
    assert query('SELECT recalled FROM messages WHERE id = %s', msg_id) == [{'recalled': True}]


def test_nobody_has_owner_powers_in_the_lobby():
    for u in ('alice', 'bob'):
        create_user(u)
    alice, bob = connect_as('alice'), connect_as('bob')
    join(alice, '大厅')
    join(bob, '大厅')
    alice.emit('kick_member', {'target': 'bob', 'room': '大厅'})
    assert events(alice, 'kick_result')[0]['success'] is False


def test_back_redirect_stays_inside_the_admin_panel():
    create_user('alice')
    resp = admin_client().post('/admin/rooms/大厅/unkick',
                               data={'username': 'alice', 'next': 'https://evil.example/'})
    assert resp.headers['Location'].startswith('/admin/')

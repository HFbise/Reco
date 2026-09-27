"""Room passwords and closing DMs."""

from conftest import connect_as, create_room, create_user, events, get_db, query


def join(client, room, password=''):
    client.emit('join', {'room': room, 'password': password, 'skip_history': True})
    return events(client, 'join_result')[0]


def test_outsider_needs_the_room_password():
    create_user('owner')
    create_user('guest')
    create_room('vault', owner='owner', password='pw')
    guest = connect_as('guest')
    assert join(guest, 'vault')['success'] is False
    assert join(guest, 'vault', password='pw')['success']


def test_owner_admin_and_members_skip_the_password():
    for u in ('owner', 'mod', 'member'):
        create_user(u)
    create_room('vault', owner='owner', admins=['mod'], members=['mod', 'member'], password='pw')
    for u in ('owner', 'mod', 'member'):
        assert join(connect_as(u), 'vault')['success'], u


def test_password_is_only_needed_once():
    create_user('owner')
    create_user('guest')
    create_room('vault', owner='owner', password='pw')
    assert join(connect_as('guest'), 'vault', password='pw')['success']
    assert join(connect_as('guest'), 'vault')['success']  # new session, no password


def test_room_list_reports_needs_password_per_user():
    create_user('owner')
    create_user('guest')
    create_room('vault', owner='owner', members=['guest'], password='pw')
    owner = connect_as('owner')
    owner.emit('find_room', {'code': query("SELECT code FROM rooms WHERE name = 'vault'")[0]['code']})
    found = events(owner, 'find_room_result')[0]
    assert found['has_password'] and not found['needs_password']


def test_closed_dm_is_hidden_until_a_new_message_arrives():
    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    for c in (alice, bob):
        c.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'hey'})

    alice.emit('close_dm', {'dm_room': 'dm:alice:bob'})
    alice.get_received()
    alice.emit('get_dms', {})
    assert events(alice, 'dms_list')[0]['dms'] == []

    bob.emit('message', {'room': 'dm:alice:bob', 'text': 'you there?'})
    alice.get_received()
    alice.emit('get_dms', {})
    assert [d['dm_room'] for d in events(alice, 'dms_list')[0]['dms']] == ['dm:alice:bob']


def test_restart_keeps_members_and_room_admins():
    # Regression: _migrate() used to strip some users from every room on startup
    import app as app_module

    create_user('bise')
    create_room('club', owner='someone', members=['bise'], admins=['bise'])
    app_module._migrate()
    room = query("SELECT members, admins FROM rooms WHERE name = 'club'")[0]
    assert room['members'] == ['bise'] and room['admins'] == ['bise']
    bise = connect_as('bise')
    bise.emit('get_rooms', {})
    assert [r['name'] for r in events(bise, 'rooms_list')[0]['rooms']] == ['大厅', 'club']


def test_lobby_has_no_owner_or_room_admins_after_startup():
    import app as app_module

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE rooms SET owner = 'admin', admins = '{mod}' WHERE name = '大厅'")
        conn.commit()
    app_module._migrate()
    assert query("SELECT owner, admins FROM rooms WHERE name = '大厅'") == [{'owner': None, 'admins': []}]


def test_system_messages_carry_a_code_for_translation():
    create_user('alice', screenname='Alice')
    alice = connect_as('alice')
    alice.emit('join', {'room': '大厅', 'skip_history': True})
    system = [m for m in events(alice, 'message') if m.get('system')]
    assert system[-1]['meta'] == {'system': {'code': 'user_joined', 'params': {'name': 'Alice'}}}
    stored = query('SELECT text, meta FROM messages WHERE system')[0]
    assert stored['text'] == 'Alice 加入了房间'  # readable fallback for the admin panel
    assert stored['meta']['system']['code'] == 'user_joined'


def test_legacy_system_messages_are_converted_to_codes():
    import app as app_module

    with get_db() as conn:
        cur = conn.cursor()
        for text in (
            'Alice 加入了房间',
            'Bob Smith 离开了房间',
            'Carol 被踢出了房间',
            'Dan 成为了管理员',
            'Eve 被取消了管理员',
            '某种未知的旧格式',
        ):
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, system)'
                " VALUES ('大厅', 'system', '系统', %s, TRUE)",
                (text,),
            )
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text)'
            " VALUES ('大厅', 'alice', 'Alice', '我刚加入了房间')"
        )  # ordinary chat: untouched
        conn.commit()
    app_module._migrate()
    app_module._migrate()  # idempotent
    rows = {r['text']: r['meta'] for r in query('SELECT text, meta FROM messages')}
    assert rows['Alice 加入了房间'] == {'system': {'code': 'user_joined', 'params': {'name': 'Alice'}}}
    assert rows['Bob Smith 离开了房间']['system']['params'] == {'name': 'Bob Smith'}
    assert rows['Carol 被踢出了房间']['system']['code'] == 'user_kicked'
    assert rows['Dan 成为了管理员']['system']['code'] == 'admin_added'
    assert rows['Eve 被取消了管理员']['system']['code'] == 'admin_removed'
    assert rows['某种未知的旧格式'] is None
    assert rows['我刚加入了房间'] is None

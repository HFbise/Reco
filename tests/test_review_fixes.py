"""Regression tests for bugs found in the code review of September 2026."""

import pytest
from conftest import anon_client, connect_as, create_room, create_user, events, get_db, login, query

import state


@pytest.fixture
def demo_room():
    import demo

    with get_db() as conn:
        demo.seed(conn.cursor())
        conn.commit()


def join(client, room, **extra):
    client.emit('join', {'room': room, 'skip_history': True, **extra})
    return events(client, 'join_result')[0]


# ── DMs ───────────────────────────────────────────────────────


def test_underscore_in_a_username_does_not_match_other_peoples_dms():
    # '_' is a LIKE wildcard: 'a_b' must not be treated as matching 'acb'
    for name in ('a_b', 'acb', 'zed'):
        create_user(name)
    acb, snoop = connect_as('acb'), connect_as('a_b')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:acb:zed', 'acb', 'acb', 'secret')"
        )
        conn.commit()

    snoop.emit('get_dms', {})
    assert events(snoop, 'dms_list')[0]['dms'] == []

    acb.emit('join_dm', {'dm_room': 'dm:acb:zed'})
    acb.emit('message', {'room': 'dm:acb:zed', 'text': 'still secret'})
    assert not [m for m in events(snoop, 'message') if m.get('room') == 'dm:acb:zed']


# ── presence ──────────────────────────────────────────────────


def test_signed_out_sockets_and_guests_do_not_see_who_comes_online():
    stranger = anon_client()
    guest = anon_client()
    guest.emit('guest_login', {})
    create_user('bob')
    watcher = connect_as('bob')
    events(watcher, 'online_status_changed')
    create_user('carol')
    connect_as('carol')
    assert events(stranger, 'online_status_changed') == []
    assert events(guest, 'online_status_changed') == []
    # (connect_as logs in, disconnects and reconnects: carol goes online, offline, online)
    assert {e['username'] for e in events(watcher, 'online_status_changed')} == {'carol'}


def test_signing_in_as_someone_else_on_the_same_socket_signs_the_first_one_out():
    create_user('alice')
    create_user('bob')
    client, _ = login('alice')
    client.emit('login', {'username': 'bob', 'password': 'secret123'})
    assert events(client, 'login_result')[0]['success']
    assert 'alice' not in state.online_users


# ── input validation ──────────────────────────────────────────


@pytest.mark.parametrize('payload', [None, {}, {'username': 3, 'password': ['x']}, 'nope'])
def test_malformed_login_gets_an_answer_instead_of_a_crash(payload):
    client = anon_client()
    client.emit('login', payload)
    result = events(client, 'login_result')
    assert result and result[0]['success'] is False


def test_avatar_must_be_a_known_expression_and_a_hex_color():
    create_user('alice')
    alice = connect_as('alice')
    alice.emit('save_avatar', {'expression': 'Smile', 'color': 'url(javascript:x)'})
    assert events(alice, 'save_avatar_result')[0]['code'] == 'invalid_avatar'
    alice.emit('save_avatar', {'expression': 'Laugh', 'color': '#3BA55C'})
    assert events(alice, 'save_avatar_result')[0]['success']
    # The newer faces are allowed too; their file names aren't keys ('o.O' is stored as 'oO')
    alice.emit('save_avatar', {'expression': 'Crazy', 'color': '#3BA55C'})
    assert events(alice, 'save_avatar_result')[0]['success']
    alice.emit('save_avatar', {'expression': 'o.O', 'color': '#3BA55C'})
    assert events(alice, 'save_avatar_result')[0]['code'] == 'invalid_avatar'


def test_guests_can_only_look_up_demo_profiles(demo_room):
    create_user('alice')
    guest = anon_client()
    guest.emit('guest_login', {})
    guest.emit('get_profile', {'username': 'alice'})
    assert events(guest, 'profile_result')[0]['success'] is False
    guest.emit('get_profile', {'username': 'demo_maya'})
    assert events(guest, 'profile_result')[0]['success']


# ── sessions end when the password changes ────────────────────


def test_changing_the_password_signs_out_other_devices():
    create_user('alice')
    phone, laptop = connect_as('alice'), connect_as('alice')
    laptop.emit('change_password', {'old_password': 'secret123', 'new_password': 'another1'})
    assert events(laptop, 'change_password_result')[0]['success']
    assert events(phone, 'session_expired')
    phone.emit('get_rooms', {})
    assert events(phone, 'auth_required')
    laptop.emit('get_rooms', {})
    assert events(laptop, 'rooms_list')


# ── rooms ─────────────────────────────────────────────────────


def test_first_join_lists_the_new_member():
    create_user('owner')
    create_user('newbie')
    create_room('club', 'owner', members=['owner'])
    owner, newbie = connect_as('owner'), connect_as('newbie')
    join(owner, 'club')
    events(owner, 'members_list')
    result = join(newbie, 'club')
    assert 'newbie' in [m['username'] for m in result['members']]
    assert 'newbie' in [m['username'] for m in events(owner, 'members_list')[-1]['members']]


def test_closing_a_room_says_which_room_and_clears_its_voice_channel():
    create_user('owner')
    create_room('club', 'owner', members=['owner'])
    owner = connect_as('owner')
    join(owner, 'club')
    owner.emit('voice_join', {'room': 'club'})
    owner.emit('close_room', {'room': 'club'})
    assert events(owner, 'room_closed') == [{'room': 'club'}]
    assert 'club' not in state.rooms_voice


def test_room_codes_cannot_be_guessed_quickly():
    create_user('alice')
    alice = connect_as('alice')
    for _ in range(10):
        alice.emit('find_room', {'code': '000000'})
    assert all(r['code'] == 'room_code_not_found' for r in events(alice, 'find_room_result'))
    alice.emit('find_room', {'code': '000001'})
    assert events(alice, 'find_room_result')[0]['code'] == 'too_many_attempts'


# ── voice ─────────────────────────────────────────────────────


def voice_room(*users):
    for u in users:
        create_user(u)
    create_room('club', users[0], members=list(users))
    clients = []
    for u in users:
        c = connect_as(u)
        join(c, 'club')
        c.emit('voice_join', {'room': 'club'})
        clients.append(c)
    for c in clients:
        c.get_received()
    return clients


def test_voice_signaling_reaches_only_its_target():
    alice, bob, carol = voice_room('alice', 'bob', 'carol')
    create_user('dave')
    query("UPDATE rooms SET members = array_append(members, 'dave') WHERE name = 'club' RETURNING name")
    dave = connect_as('dave')  # in the room, not in voice
    join(dave, 'club')
    for c in (alice, bob, carol, dave):
        c.get_received()
    alice.emit('voice_offer', {'room': 'club', 'to': 'bob', 'offer': {'sdp': 'candidate 203.0.113.7'}})
    alice.emit('voice_ice', {'room': 'club', 'to': 'bob', 'candidate': {'candidate': '203.0.113.7'}})
    assert [e['from'] for e in events(bob, 'voice_offer')] == ['alice']
    for other in (carol, dave, alice):
        received = [e['name'] for e in other.get_received()]
        assert 'voice_offer' not in received and 'voice_ice' not in received


def test_joining_voice_in_another_room_leaves_the_first():
    (alice,) = voice_room('alice')
    create_room('den', 'alice', members=['alice'])
    join(alice, 'den')
    alice.emit('voice_join', {'room': 'den'})
    assert 'club' not in state.rooms_voice
    assert [m['username'] for m in state.rooms_voice['den']['voice_members']] == ['alice']


def test_a_screen_share_ends_when_its_sender_disconnects():
    alice, bob = voice_room('alice', 'bob')
    alice.emit('stream_start', {'room': 'club'})
    assert events(bob, 'stream_start')
    alice.disconnect()
    assert [e['username'] for e in events(bob, 'stream_stop')] == ['alice']
    assert 'club' not in state.rooms_stream


def test_kicked_users_leave_the_voice_channel():
    owner, _troll = voice_room('owner', 'troll')
    owner.emit('kick_member', {'room': 'club', 'target': 'troll'})
    assert [m['username'] for m in state.rooms_voice['club']['voice_members']] == ['owner']


# ── messages ──────────────────────────────────────────────────


def test_a_message_that_could_not_be_saved_is_not_shown(monkeypatch):
    import handlers.messages

    create_user('alice')
    alice = connect_as('alice')
    join(alice, '大厅')
    alice.get_received()

    real_get_db = handlers.messages.get_db
    calls = {'n': 0}

    def flaky_get_db(*args, **kwargs):
        calls['n'] += 1
        if calls['n'] == 1:  # the block check doesn't run in a room; the first call is the save
            raise RuntimeError('database down')
        return real_get_db(*args, **kwargs)

    monkeypatch.setattr(handlers.messages, 'get_db', flaky_get_db)
    alice.emit('message', {'room': '大厅', 'text': 'hello?'})
    names = [e['name'] for e in alice.get_received()]
    assert 'message_failed' in names and 'message' not in names


def test_reactions_are_capped_per_message():
    create_user('alice')
    alice = connect_as('alice')
    join(alice, '大厅')
    alice.emit('message', {'room': '大厅', 'text': 'react to me'})
    msg_id = events(alice, 'message')[0]['id']
    for i in range(25):
        alice.emit('add_reaction', {'id': msg_id, 'emoji': f'e{i}'})
    reactions = query('SELECT reactions FROM messages WHERE id = %s', msg_id)[0]['reactions']
    assert len(reactions) == 20


# ── matching ──────────────────────────────────────────────────


def test_disconnecting_one_tab_keeps_the_other_tab_waiting():
    import handlers.match as match_handlers

    create_user('alice')
    tab1, tab2 = connect_as('alice'), connect_as('alice')
    tab2.emit('match_enqueue', {'mode': 'text', 'tags': []})
    tab1.disconnect()
    assert [t.username for t in match_handlers.queue.waiting('text')] == ['alice']

"""Demo visitors: read-only, and they only ever see the scripted demo room."""

import pytest
from conftest import anon_client, app, connect_as, create_user, events, get_db, query, socketio

import demo
from auth_session import verify_token


@pytest.fixture
def demo_room():
    with get_db() as conn:
        demo.seed(conn.cursor())
        conn.commit()


def guest_client():
    client = anon_client()
    client.emit('guest_login', {})
    result = events(client, 'guest_login_result')[0]
    assert result['success'] and result['username'].startswith('guest:')
    return client, result


def test_guest_sees_only_the_demo_room(demo_room):
    guest, _ = guest_client()
    guest.emit('get_rooms', {})
    assert [r['name'] for r in events(guest, 'rooms_list')[0]['rooms']] == [demo.DEMO_ROOM]

    guest.emit('join', {'room': demo.DEMO_ROOM})
    received = guest.get_received()
    history = [e['args'] for e in received if e['name'] == 'message']
    assert len(history) == len(demo.SCRIPT)
    assert next(e for e in received if e['name'] == 'join_result')['args'][0]['success']


def test_guest_cannot_open_the_real_lobby_or_dms(demo_room):
    create_user('alice')
    guest, _ = guest_client()
    guest.emit('join', {'room': '大厅'})
    assert events(guest, 'join_result')[0]['code'] == 'guest_read_only'
    guest.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    assert events(guest, 'guest_read_only') == [{}]


@pytest.mark.parametrize(
    'event, payload',
    [
        ('message', {'room': demo.DEMO_ROOM, 'text': 'hi'}),
        ('create_room', {'room': 'mine'}),
        ('voice_join', {'room': demo.DEMO_ROOM}),
        ('update_profile', {'screenname': 'Hacker', 'bio': ''}),
        ('block_user', {'blocked': 'alice'}),
        ('submit_feedback', {'text': 'spam'}),
    ],
)
def test_every_write_is_refused_for_guests(demo_room, event, payload):
    guest, _ = guest_client()
    guest.emit('join', {'room': demo.DEMO_ROOM})
    guest.get_received()
    guest.emit(event, payload)
    assert events(guest, 'guest_read_only') == [{}]


def test_guest_is_invisible_and_leaves_no_trace(demo_room):
    create_user('alice')
    alice = connect_as('alice')
    alice.get_received()
    guest, _ = guest_client()
    guest.emit('join', {'room': demo.DEMO_ROOM})
    assert events(alice, 'online_status_changed') == []  # nobody is told a guest came online
    room = query('SELECT members FROM rooms WHERE name = %s', demo.DEMO_ROOM)[0]
    assert room['members'] == list(demo.PERSONAS)  # not added as a member
    assert (
        query("SELECT count(*) AS n FROM messages WHERE room = %s AND text LIKE '%%加入%%'", demo.DEMO_ROOM)[0]['n']
        == 2
    )  # only the scripted "joined" lines


def test_demo_room_is_read_only_for_real_users_too(demo_room):
    create_user('alice')
    alice = connect_as('alice')
    alice.emit('join', {'room': demo.DEMO_ROOM})
    alice.emit('message', {'room': demo.DEMO_ROOM, 'text': 'graffiti'})
    msg_id = query('SELECT id FROM messages WHERE room = %s AND NOT system LIMIT 1', demo.DEMO_ROOM)[0]['id']
    alice.emit('add_reaction', {'id': msg_id, 'emoji': '💩'})
    assert query("SELECT * FROM messages WHERE text = 'graffiti'") == []
    assert '💩' not in query('SELECT reactions FROM messages WHERE id = %s', msg_id)[0]['reactions']


def test_guest_token_survives_reconnect():
    _, result = guest_client()
    assert verify_token(result['token']) == result['username']
    again = socketio.test_client(app, auth={'token': result['token']})
    assert events(again, 'session_ready') == [{'username': result['username']}]


def test_demo_script_refreshes_when_version_changes(demo_room, monkeypatch):
    monkeypatch.setattr(demo, 'DEMO_VERSION', demo.DEMO_VERSION + 1)
    monkeypatch.setattr(demo, 'SCRIPT', demo.SCRIPT[:2])
    with get_db() as conn:
        demo.seed(conn.cursor())
        demo.seed(conn.cursor())  # idempotent
        conn.commit()
    assert query('SELECT count(*) AS n FROM messages WHERE room = %s', demo.DEMO_ROOM)[0]['n'] == 2

"""Identity comes from the server session, never from event payloads."""
from conftest import create_user, create_room, events, connect_as, query


def join(client, room, password=''):
    client.emit('join', {'room': room, 'password': password, 'skip_history': True})
    return events(client, 'join_result')[0]


def test_cannot_impersonate_owner_to_kick():
    create_user('owner')
    create_user('mallory')
    create_user('victim')
    create_room('club', owner='owner', members=['mallory', 'victim'])
    mallory = connect_as('mallory')
    mallory.emit('kick_member', {'requester': 'owner', 'target': 'victim', 'room': 'club'})
    assert events(mallory, 'kick_result')[0]['success'] is False
    assert 'victim' in query("SELECT members FROM rooms WHERE name = 'club'")[0]['members']


def test_owner_can_kick_and_kicked_user_stops_receiving_messages():
    create_user('owner')
    create_user('bob')
    create_room('club', owner='owner', members=['bob'])
    owner, bob = connect_as('owner'), connect_as('bob')
    assert join(owner, 'club')['success'] and join(bob, 'club')['success']

    owner.emit('kick_member', {'target': 'bob', 'room': 'club'})
    assert events(owner, 'kick_result')[0]['success']
    assert events(bob, 'kicked_from_room') == [{'room': 'club'}]

    owner.emit('message', {'room': 'club', 'text': 'after the kick'})
    assert all(m['text'] != 'after the kick' for m in events(bob, 'message'))


def test_cannot_read_someone_elses_dm():
    for u in ('alice', 'bob', 'mallory'):
        create_user(u)
    mallory = connect_as('mallory')
    mallory.emit('join_dm', {'username': 'alice', 'dm_room': 'dm:alice:bob'})
    assert events(mallory, 'join_dm_result') == [{'success': False}]

    # room_subscribe used to join any Socket.IO room unchecked
    mallory.emit('room_subscribe', {'room': 'dm:alice:bob'})
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'secret'})
    assert all(m.get('text') != 'secret' for m in events(mallory, 'message'))


def test_message_sender_and_system_flag_cannot_be_spoofed():
    create_user('alice', screenname='Alice')
    alice = connect_as('alice')
    assert join(alice, '大厅')['success']
    alice.emit('message', {
        'room': '大厅', 'text': 'hi', 'username': 'admin', 'screenname': '系统', 'system': True,
    })
    msg = events(alice, 'message')[-1]
    assert msg['username'] == 'alice' and msg['screenname'] == 'Alice' and 'system' not in msg
    row = query("SELECT username, system FROM messages WHERE text = 'hi'")[0]
    assert row['username'] == 'alice' and not row['system']


def test_cannot_post_to_a_room_without_joining():
    create_user('alice')
    create_room('private', owner='someone', password='pw')
    alice = connect_as('alice')
    alice.emit('message', {'room': 'private', 'text': 'sneaky'})
    assert query("SELECT * FROM messages WHERE text = 'sneaky'") == []


def test_cannot_edit_or_recall_others_messages():
    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    join(alice, '大厅')
    join(bob, '大厅')
    alice.emit('message', {'room': '大厅', 'text': 'original'})
    msg_id = query("SELECT id FROM messages WHERE text = 'original'")[0]['id']

    bob.emit('edit_message', {'id': msg_id, 'text': 'tampered', 'username': 'alice'})
    bob.emit('recall_message', {'id': msg_id, 'username': 'alice'})
    row = query('SELECT text, recalled FROM messages WHERE id = %s', msg_id)[0]
    assert row['text'] == 'original' and not row['recalled']


def test_room_names_cannot_collide_with_dm_namespace():
    create_user('mallory')
    mallory = connect_as('mallory')
    mallory.emit('create_room', {'room': 'dm:alice:bob'})
    assert events(mallory, 'create_room_result')[0]['success'] is False


def test_block_list_uses_session_identity():
    create_user('alice')
    create_user('bob')
    bob = connect_as('bob')
    bob.emit('block_user', {'blocker': 'alice', 'blocked': 'carol'})
    assert query('SELECT blocker FROM blocks') == [{'blocker': 'bob'}]

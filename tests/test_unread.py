"""Unread counts kept on the server: they survive reloads and match across devices."""

from conftest import connect_as, create_room, create_user, events, get_db, query

import reads


def say(room, who, text, system=False):
    with get_db() as conn:
        conn.cursor().execute(
            'INSERT INTO messages (room, username, screenname, text, system) VALUES (%s, %s, %s, %s, %s)',
            (room, who, who.title(), text, system),
        )
        conn.commit()


def unread_rooms(client):
    client.emit('get_rooms', {})
    return {r['name']: r['unread'] for r in events(client, 'rooms_list')[0]['rooms']}


def unread_dms(client):
    client.emit('get_dms', {})
    return {d['dm_room']: d['unread'] for d in events(client, 'dms_list')[0]['dms']}


def test_a_dm_received_while_away_is_unread_until_opened_on_any_device():
    create_user('alice')
    create_user('bob')
    say('dm:alice:bob', 'bob', 'you up?')
    say('dm:alice:bob', 'bob', 'call me')
    phone, laptop = connect_as('alice'), connect_as('alice')
    assert unread_dms(phone) == {'dm:alice:bob': 2}
    laptop.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    laptop.get_received()
    assert unread_dms(phone) == {'dm:alice:bob': 0}


def test_room_unread_counts_only_other_peoples_real_messages():
    create_user('alice')
    create_user('bob')
    create_room('club', owner='alice', members=['alice', 'bob'])
    alice = connect_as('alice')
    alice.emit('join', {'room': 'club'})
    alice.get_received()
    say('club', 'bob', 'hi')
    say('club', 'alice', 'my own message')
    say('club', 'system', 'Bob joined', system=True)
    assert unread_rooms(connect_as('alice'))['club'] == 1


def test_the_lobby_is_not_unread_for_someone_who_never_opened_it():
    create_user('alice')
    create_user('bob')
    say('大厅', 'bob', 'hello everyone')
    assert unread_rooms(connect_as('alice'))['大厅'] == 0


def test_marks_only_move_forward_and_only_for_rooms_you_are_in():
    create_user('alice')
    create_user('bob')
    create_room('club', owner='alice', members=['alice', 'bob'])
    for i in range(3):
        say('club', 'bob', f'm{i}')
    ids = [r['id'] for r in query("SELECT id FROM messages WHERE room = 'club' ORDER BY id")]
    alice = connect_as('alice')
    alice.emit('mark_read', {'room': 'club', 'id': ids[-1]})  # not joined: ignored
    assert unread_rooms(connect_as('alice'))['club'] == 0  # never opened a room: nothing is news
    alice.emit('join', {'room': 'club', 'skip_history': True})
    alice.get_received()
    with get_db() as conn:
        reads.mark_read(conn.cursor(), 'alice', 'club', ids[0])
        conn.commit()
    assert unread_rooms(alice)['club'] == 2
    alice.emit('mark_read', {'room': 'club', 'id': ids[1]})
    assert unread_rooms(alice)['club'] == 1
    alice.emit('mark_read', {'room': 'club', 'id': ids[0]})  # backwards: ignored
    assert unread_rooms(alice)['club'] == 1


def test_first_migration_counts_everything_already_there_as_read():
    create_user('alice')
    create_user('bob')
    create_room('club', owner='alice', members=['alice', 'bob'])
    say('club', 'bob', 'old news')
    say('dm:alice:bob', 'bob', 'old dm')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('DROP TABLE read_marks')
        reads.migrate(cur)  # as on the first deploy with this feature
        conn.commit()
    alice = connect_as('alice')
    assert unread_rooms(alice)['club'] == 0
    assert unread_dms(alice) == {'dm:alice:bob': 0}
    say('dm:alice:bob', 'bob', 'new dm')
    assert unread_dms(alice) == {'dm:alice:bob': 1}

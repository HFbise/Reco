"""Where a chat opens (the first unread message), pinned messages, and handing a room over."""

from conftest import connect_as, create_room, create_user, events, get_db, query


def join(client, room, **extra):
    client.emit('join', {'room': room, **extra})
    return events(client, 'join_result')[0]


def say(client, room, text):
    client.emit('message', {'room': room, 'text': text})
    return query('SELECT id FROM messages WHERE text = %s', text)[0]['id']


# ── unread on opening ─────────────────────────────────────────


def test_opening_a_room_says_where_the_unread_messages_start():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    join(alice, 'club', skip_history=True)
    assert join(bob, 'club')['unread'] is None  # read up to here
    bob.disconnect()
    say(alice, 'club', 'mine first')
    first = say(alice, 'club', 'one')
    say(alice, 'club', 'two')
    bob = connect_as('bob')
    assert join(bob, 'club')['unread'] == {'id': first - 1, 'count': 3}
    assert join(bob, 'club')['unread'] is None  # opening marked them read (a rejoin finds none)


def test_a_new_dm_is_all_unread():
    create_user('alice')
    create_user('bob')
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    first = say(alice, 'dm:alice:bob', 'hi bob')
    bob = connect_as('bob')
    bob.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    assert events(bob, 'join_dm_result')[0]['unread'] == {'id': first, 'count': 1}


# ── pins ──────────────────────────────────────────────────────


def pins_of(client):
    return [[p['id'] for p in e['pins']] for e in events(client, 'pins_updated')]


def test_owners_and_admins_pin_in_a_room_and_everyone_sees_it():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    join(alice, 'club', skip_history=True)
    join(bob, 'club', skip_history=True)
    msg = say(bob, 'club', 'meet at 6')
    bob.emit('pin_message', {'id': msg})  # a member may not
    assert events(bob, 'pin_result')[0]['code'] == 'no_permission'
    alice.emit('pin_message', {'id': msg})
    assert pins_of(bob) == [[msg]]
    bob.emit('get_pins', {'room': 'club'})
    pin = events(bob, 'pins_updated')[0]['pins'][0]
    assert (pin['text'], pin['screenname'], pin['pinned_by']) == ('meet at 6', 'Bob', 'alice')
    alice.emit('unpin_message', {'id': msg})
    assert pins_of(bob) == [[]]


def test_both_people_pin_in_a_dm_and_a_recall_unpins():
    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    for c in (alice, bob):
        c.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    msg = say(alice, 'dm:alice:bob', 'the address')
    bob.emit('pin_message', {'id': msg})
    assert pins_of(alice) == [[msg]]
    alice.emit('recall_message', {'id': msg})
    assert pins_of(bob)[-1] == []
    assert query('SELECT * FROM pinned_messages') == []


def test_a_chat_has_a_limit_on_pins_and_closing_a_room_drops_them():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club', skip_history=True)
    with get_db() as conn:  # more than the send rate allows at once
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text)'
            " SELECT 'club', 'alice', 'Alice', 'note ' || g FROM generate_series(1, 21) g RETURNING id"
        )
        ids = [r['id'] for r in cur.fetchall()]
        conn.commit()
    for msg in ids:
        alice.emit('pin_message', {'id': msg})
    assert events(alice, 'pin_result')[-1]['code'] == 'too_many_pins'
    assert len(query('SELECT * FROM pinned_messages')) == 20
    alice.emit('close_room', {'room': 'club'})
    assert query('SELECT * FROM pinned_messages') == []


def test_pins_are_only_read_from_inside_the_chat():
    create_user('alice')
    create_user('eve')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club', skip_history=True)
    alice.emit('pin_message', {'id': say(alice, 'club', 'secret plan')})
    eve = connect_as('eve')
    eve.emit('get_pins', {'room': 'club'})
    assert events(eve, 'pins_updated') == []


# ── handing a room over ───────────────────────────────────────


def test_the_owner_hands_the_room_over_and_stays_as_admin():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    join(alice, 'club', skip_history=True)
    join(bob, 'club', skip_history=True)
    bob.emit('transfer_owner', {'room': 'club', 'target': 'bob'})
    assert events(bob, 'transfer_owner_result')[0]['code'] == 'no_permission'
    alice.emit('transfer_owner', {'room': 'club', 'target': 'bob'})
    assert events(alice, 'transfer_owner_result')[0]['success']
    row = query("SELECT owner, admins FROM rooms WHERE name = 'club'")[0]
    assert (row['owner'], row['admins']) == ('bob', ['alice'])
    roles = events(bob, 'room_roles')
    assert roles == [{'room': 'club', 'owner': 'bob', 'admins': ['alice']}]
    assert query("SELECT action, target FROM room_log WHERE room = 'club'") == [
        {'action': 'transfer_owner', 'target': 'bob'}
    ]


def test_only_a_member_can_be_handed_a_room():
    create_user('alice')
    create_user('eve')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club', skip_history=True)
    alice.emit('transfer_owner', {'room': 'club', 'target': 'eve'})
    assert events(alice, 'transfer_owner_result')[0]['code'] == 'user_not_in_room'
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT owner FROM rooms WHERE name = 'club'")
        assert cur.fetchone()['owner'] == 'alice'

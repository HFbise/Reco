"""Sending a message: the acknowledgement, the client's id coming back, and safe resends."""

from conftest import connect_as, create_room, create_user, events, get_db, query

import moderation


def send(client, room, text, client_id=None):
    payload = {'room': room, 'text': text}
    if client_id:
        payload['client_id'] = client_id
    return client.emit('message', payload, callback=True)


def test_a_sent_message_is_acknowledged_and_carries_the_senders_id():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    for c in (alice, bob):
        c.emit('join', {'room': 'club', 'skip_history': True})
        c.get_received()
    reply = send(alice, 'club', 'hello', 'c-1')
    [stored] = query('SELECT id FROM messages')
    assert reply == {'ok': True, 'id': stored['id']}
    assert events(alice, 'message')[-1]['client_id'] == 'c-1'
    assert events(bob, 'message')[-1]['text'] == 'hello'
    assert send(alice, 'club', 'no id') == {'ok': True, 'id': stored['id'] + 1}  # older clients


def test_sending_again_with_the_same_id_stores_it_once():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    alice.emit('join', {'room': 'club', 'skip_history': True})
    first = send(alice, 'club', 'only once', 'c-7')
    alice.get_received()
    again = send(alice, 'club', 'only once', 'c-7')
    assert again == first
    assert len(query('SELECT 1 FROM messages')) == 1
    # The sender gets the message again, in case the first copy was lost too
    [msg] = events(alice, 'message')
    assert (msg['id'], msg['client_id'], msg['text']) == (first['id'], 'c-7', 'only once')


def test_a_failed_send_says_why_and_can_be_tried_again():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    alice.emit('join', {'room': 'club', 'skip_history': True})
    moderation.restrict('club', 'alice', moderation.TEXT)
    assert send(alice, 'club', 'hi', 'c-9') == {'ok': False, 'code': 'muted'}
    moderation.lift('club', 'alice', moderation.TEXT)
    assert send(alice, 'club', 'hi', 'c-9')['ok']  # the failure wasn't remembered


def test_a_member_whose_socket_has_not_rejoined_yet_can_still_send():
    """After a reconnect the client resends at once; it may beat the room rejoin."""
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')  # never sent 'join' on this socket
    assert send(alice, 'club', 'right away', 'c-2')['ok']


def test_outsiders_and_blocked_people_are_refused():
    create_user('alice')
    create_user('eve')
    create_room('club', 'alice', members=['alice'])
    eve = connect_as('eve')
    assert send(eve, 'club', 'let me in', 'c-3') == {'ok': False, 'code': 'no_permission'}
    assert send(eve, 'dm:alice:bob', 'hi', 'c-4') == {'ok': False, 'code': 'no_permission'}
    with get_db() as conn:
        conn.cursor().execute("INSERT INTO blocks (blocker, blocked) VALUES ('alice', 'eve')")
        conn.commit()
    eve.emit('join_dm', {'dm_room': 'dm:alice:eve'})
    assert send(eve, 'dm:alice:eve', 'hi', 'c-5') == {'ok': False, 'code': 'dm_blocked'}
    assert query('SELECT 1 FROM messages') == []

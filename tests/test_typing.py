"""'Someone is typing' in rooms and DMs: who gets it, who can send it, and how often."""

import pytest
from conftest import anon_client, connect_as, create_room, create_user, events

import handlers.messages as messages


@pytest.fixture(autouse=True)
def fresh_throttle():
    messages._last_typing.clear()


def joined(username, room):
    client = connect_as(username)
    if room.startswith('dm:'):
        client.emit('join_dm', {'dm_room': room})
    else:
        client.emit('join', {'room': room})
    client.get_received()
    return client


def test_typing_reaches_the_others_in_the_room_but_not_the_typist():
    for u in ('alice', 'bob'):
        create_user(u)
    create_room('club', owner='alice', members=['alice', 'bob'])
    alice, bob = joined('alice', 'club'), joined('bob', 'club')
    alice.emit('typing', {'room': 'club'})
    assert events(bob, 'typing') == [{'room': 'club', 'username': 'alice', 'screenname': 'Alice'}]
    assert events(alice, 'typing') == []


def test_you_cannot_type_into_a_room_you_have_not_joined():
    for u in ('alice', 'bob', 'mallory'):
        create_user(u)
    create_room('club', owner='alice', members=['alice', 'bob'])
    bob = joined('bob', 'club')
    connect_as('mallory').emit('typing', {'room': 'club'})
    guest = anon_client()
    guest.emit('guest_login', {})
    guest.emit('typing', {'room': 'club'})
    assert events(bob, 'typing') == []


def test_no_typing_across_a_block_in_dms():
    for u in ('alice', 'bob'):
        create_user(u)
    alice, bob = joined('alice', 'dm:alice:bob'), joined('bob', 'dm:alice:bob')
    bob.emit('block_user', {'blocked': 'alice'})
    alice.emit('typing', {'room': 'dm:alice:bob'})
    assert events(bob, 'typing') == []


def test_typing_is_throttled_per_person():
    for u in ('alice', 'bob'):
        create_user(u)
    create_room('club', owner='alice', members=['alice', 'bob'])
    alice, bob = joined('alice', 'club'), joined('bob', 'club')
    for _ in range(5):
        alice.emit('typing', {'room': 'club'})
    assert len(events(bob, 'typing')) == 1

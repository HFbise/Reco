"""The chat lists for a client that already holds them: a short "unchanged" instead of the lists."""

from conftest import connect_as, create_room, create_user, events


def rooms_reply(client, digest=None):
    client.emit('get_rooms', {'digest': digest} if digest else {})
    return events(client, 'rooms_list')[0]


def dms_reply(client, digest=None):
    client.emit('get_dms', {'digest': digest} if digest else {})
    return events(client, 'dms_list')[0]


def test_an_unchanged_room_list_is_not_sent_again():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    full = rooms_reply(alice)
    assert [r['name'] for r in full['rooms']] == ['大厅', 'club'] and full['digest']
    assert rooms_reply(alice, full['digest']) == {'unchanged': True, 'digest': full['digest']}
    assert 'rooms' in rooms_reply(alice, 'something-older')  # a different fingerprint: the list


def test_any_change_to_the_list_sends_it_again():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    alice.emit('join', {'room': 'club'})  # opened once: from here on, new messages are unread
    digest = rooms_reply(alice)['digest']
    bob.emit('join', {'room': 'club', 'skip_history': True})
    bob.emit('message', {'room': 'club', 'text': 'hi'})  # unread for alice now
    changed = rooms_reply(alice, digest)
    assert next(r for r in changed['rooms'] if r['name'] == 'club')['unread'] == 1


def test_unchanged_still_subscribes_to_every_room():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    digest = rooms_reply(connect_as('alice'))['digest']
    alice = connect_as('alice')  # a new socket, holding the list from before
    assert rooms_reply(alice, digest)['unchanged']
    bob = connect_as('bob')
    bob.emit('join', {'room': 'club', 'skip_history': True})
    bob.emit('message', {'room': 'club', 'text': 'live'})
    assert [m['text'] for m in events(alice, 'message')] == ['live']


def test_an_unchanged_dm_list_still_says_who_is_online():
    create_user('alice')
    create_user('bob')
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'hey'})
    full = dms_reply(alice)
    assert full['dms'][0]['online'] is False
    connect_as('bob')  # comes online: not a change to the list itself
    reply = dms_reply(alice, full['digest'])
    assert reply == {'unchanged': True, 'digest': full['digest'], 'online': {'bob': True}}

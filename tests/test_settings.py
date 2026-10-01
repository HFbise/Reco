"""Your own settings: who may message you first, showing as online, which notifications you get."""

import pytest
from conftest import anon_client, connect_as, create_room, create_user, events, login, query

import webpush


def settings_of(client):
    client.emit('get_settings', {})
    return events(client, 'settings')[-1]


def say(client, room, text):
    client.emit('message', {'room': room, 'text': text})


def got_message(client, text):
    return any(m['text'] == text for m in events(client, 'message'))


@pytest.fixture
def pushes(monkeypatch):
    """(usernames, code) for every web push that would go out."""
    sent = []
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'k')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'k')
    monkeypatch.setattr(webpush, 'notify', lambda users, title, *a, code='', **k: sent.append((list(users), code)))
    return sent


# ── saving ────────────────────────────────────────────────────


def test_settings_start_at_the_defaults_and_reach_every_device():
    create_user('alice')
    phone, laptop = connect_as('alice'), connect_as('alice')
    assert settings_of(phone) == {'dm_from': 'everyone', 'show_online': True, 'push_dms': True, 'push_matches': True}
    phone.emit('update_settings', {'dm_from': 'rooms', 'push_dms': False})
    assert events(laptop, 'settings')[-1] == {
        'dm_from': 'rooms',
        'show_online': True,
        'push_dms': False,
        'push_matches': True,
    }
    assert settings_of(connect_as('alice'))['dm_from'] == 'rooms'  # kept for the next session


def test_unknown_or_malformed_settings_are_ignored():
    create_user('alice')
    alice = connect_as('alice')
    alice.emit('update_settings', {'dm_from': 'friends', 'show_online': 'no', 'password': 'x'})
    alice.emit('update_settings', 'nonsense')
    assert events(alice, 'settings') == []
    assert settings_of(alice)['dm_from'] == 'everyone'


def test_guests_have_no_settings():
    guest = anon_client()
    guest.emit('guest_login', {})
    guest.emit('update_settings', {'dm_from': 'nobody'})
    assert events(guest, 'settings') == []


# ── who may message you first ────────────────────────────────


def test_nobody_can_start_a_dm_but_a_chat_already_going_carries_on():
    for u in ('alice', 'bob', 'carol'):
        create_user(u)
    alice, bob, carol = connect_as('alice'), connect_as('bob'), connect_as('carol')
    bob.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    say(bob, 'dm:alice:bob', 'hi alice')  # they already talk
    alice.emit('update_settings', {'dm_from': 'nobody'})

    carol.emit('join_dm', {'dm_room': 'dm:alice:carol'})
    say(carol, 'dm:alice:carol', 'hello stranger')
    received = carol.get_received()
    assert [e['args'] for e in received if e['name'] == 'dm_not_allowed'] == [[{'room': 'dm:alice:carol'}]]
    assert not [e for e in received if e['name'] == 'message']
    assert query('SELECT 1 FROM messages WHERE room = %s', 'dm:alice:carol') == []

    say(bob, 'dm:alice:bob', 'still here')
    assert got_message(bob, 'still here')

    # Alice herself can still start one with Carol
    alice.emit('join_dm', {'dm_room': 'dm:alice:carol'})
    say(alice, 'dm:alice:carol', 'hi carol')
    assert got_message(alice, 'hi carol')


def test_people_in_my_rooms_means_a_shared_room_not_the_lobby():
    for u in ('alice', 'bob', 'carol'):
        create_user(u)
    create_room('club', 'alice', members=['alice', 'bob'])
    alice = connect_as('alice')
    alice.emit('update_settings', {'dm_from': 'rooms'})
    for client in (connect_as(u) for u in ('bob', 'carol')):
        client.emit('join', {'room': '大厅', 'skip_history': True})  # everyone shares the lobby
    bob, carol = connect_as('bob'), connect_as('carol')
    bob.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    say(bob, 'dm:alice:bob', 'from the club')
    assert got_message(bob, 'from the club')
    carol.emit('join_dm', {'dm_room': 'dm:alice:carol'})
    say(carol, 'dm:alice:carol', 'from nowhere')
    assert events(carol, 'dm_not_allowed') == [{'room': 'dm:alice:carol'}]


# ── showing as online ────────────────────────────────────────


def test_hiding_online_status_takes_effect_at_once_and_on_the_next_sign_in():
    for u in ('alice', 'bob'):
        create_user(u)
    create_room('club', 'alice', members=['alice', 'bob'])
    bob = connect_as('bob')
    bob.emit('join', {'room': 'club', 'skip_history': True})
    alice = connect_as('alice')
    events(bob, 'online_status_changed')
    alice.emit('update_settings', {'show_online': False})
    assert events(bob, 'online_status_changed') == [{'username': 'alice', 'online': False}]

    def alice_in_members():
        bob.emit('get_members', {'room': 'club'})
        reply = events(bob, 'members_list')[-1]
        return next(m for m in reply['members'] if m['username'] == 'alice')

    assert not alice_in_members()['is_online']
    alice.disconnect()
    assert events(bob, 'online_status_changed') == []  # never seen, so never "gone"
    alice = connect_as('alice')
    assert events(bob, 'online_status_changed') == []
    assert not alice_in_members()['is_online']

    alice.emit('update_settings', {'show_online': True})
    assert events(bob, 'online_status_changed') == [{'username': 'alice', 'online': True}]
    assert alice_in_members()['is_online']


def test_the_dm_list_hides_it_too():
    for u in ('alice', 'bob'):
        create_user(u)
    alice, bob = connect_as('alice'), connect_as('bob')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    say(alice, 'dm:alice:bob', 'hi')
    alice.emit('update_settings', {'show_online': False})
    bob.emit('get_dms', {})
    [dm] = events(bob, 'dms_list')[-1]['dms']
    assert dm['online'] is False


# ── notifications ────────────────────────────────────────────


def test_dm_notifications_can_be_turned_off(pushes):
    for u in ('alice', 'bob'):
        create_user(u)
    bob, _ = login('bob')
    bob.emit('update_settings', {'push_dms': False})
    bob.disconnect()
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    say(alice, 'dm:alice:bob', 'are you there?')
    assert pushes == []


def test_match_notifications_can_be_turned_off(pushes):
    for u in ('alice', 'bob'):
        create_user(u)
    alice, bob = connect_as('alice'), connect_as('bob')
    alice.emit('update_settings', {'push_matches': False})
    for client in (alice, bob):
        client.emit('page_visibility', {'hidden': True})  # both waiting in a background tab
        client.emit('match_enqueue', {'mode': 'text', 'tags': []})
    assert pushes == [(['bob'], 'match_found')]


# ── the blocked list ─────────────────────────────────────────


def test_the_blocked_list_shows_who_they_are():
    create_user('alice')
    create_user('bob', screenname='Bobby')
    alice = connect_as('alice')
    alice.emit('block_user', {'blocked': 'bob'})
    alice.emit('get_blocked_users', {})
    reply = events(alice, 'blocked_users_list')[-1]
    assert reply['users'] == ['bob']
    assert [(p['username'], p['screenname']) for p in reply['people']] == [('bob', 'Bobby')]

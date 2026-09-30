"""The chat card: pin, mute, mark as read, search and photos."""

import pytest
from conftest import anon_client, connect_as, create_room, create_user, events, get_db, login, query

import webpush


def join(client, room):
    client.emit('join', {'room': room, 'skip_history': True})
    assert events(client, 'join_result')[0]['success']


def say(client, room, text):
    client.emit('message', {'room': room, 'text': text})
    return events(client, 'message')[-1]


def rooms_list(client):
    client.emit('get_rooms', {})
    return {r['name']: r for r in events(client, 'rooms_list')[0]['rooms']}


# ── pin and mute ──────────────────────────────────────────────


def test_pin_and_mute_are_per_person_and_reach_every_device():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    phone, laptop = connect_as('alice'), connect_as('alice')
    phone.emit('set_chat_pref', {'room': 'club', 'pinned': True})
    assert events(laptop, 'chat_pref') == [{'room': 'club', 'pinned': True, 'muted': False}]
    laptop.emit('set_chat_pref', {'room': 'club', 'muted': True})  # pin stays
    assert events(phone, 'chat_pref')[-1] == {'room': 'club', 'pinned': True, 'muted': True}
    assert rooms_list(phone)['club']['pinned'] and rooms_list(phone)['club']['muted']
    assert not rooms_list(connect_as('bob'))['club']['pinned']  # bob's list is his own


def test_a_dm_can_be_pinned_and_muted_too():
    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    say(alice, 'dm:alice:bob', 'hi')
    bob.emit('set_chat_pref', {'room': 'dm:alice:bob', 'pinned': True, 'muted': True})
    bob.emit('get_dms', {})
    [dm] = events(bob, 'dms_list')[-1]['dms']
    assert dm['pinned'] and dm['muted']


def test_you_can_only_set_chats_you_can_see():
    create_user('alice')
    create_user('eve')
    create_room('club', 'alice', members=['alice'])
    eve = connect_as('eve')
    eve.emit('set_chat_pref', {'room': 'club', 'pinned': True})
    eve.emit('set_chat_pref', {'room': 'dm:alice:bob', 'muted': True})
    assert [e['code'] for e in events(eve, 'chat_pref_result')] == ['no_permission', 'no_permission']
    assert query('SELECT * FROM chat_prefs') == []


@pytest.fixture
def pushes(monkeypatch):
    """(usernames, title) for every web push that would go out."""
    sent = []
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'k')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'k')
    monkeypatch.setattr(webpush, 'notify', lambda users, title, *a, **k: sent.append((list(users), title)))
    return sent


def test_a_muted_dm_sends_no_notification(pushes):
    create_user('alice', screenname='Alice')
    create_user('bob')
    bob, _ = login('bob')
    bob.emit('set_chat_pref', {'room': 'dm:alice:bob', 'muted': True})
    bob.disconnect()
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    say(alice, 'dm:alice:bob', 'hello?')
    assert pushes == []
    create_user('carol', screenname='Carol')
    carol = connect_as('carol')
    carol.emit('join_dm', {'dm_room': 'dm:bob:carol'})
    say(carol, 'dm:bob:carol', 'hey bob')
    assert pushes == [(['bob'], 'Carol')]  # other chats still notify


def test_a_muted_room_sends_no_phone_notification(monkeypatch):
    import handlers.messages

    sent = []
    monkeypatch.setattr(handlers.messages, 'tokens_for', lambda users: list(users))
    monkeypatch.setattr(handlers.messages, 'send_push', lambda tokens, *a, **k: sent.append(sorted(tokens)))
    create_user('alice')
    create_user('bob')
    create_user('carol')
    create_room('club', 'alice', members=['alice', 'bob', 'carol'])
    with get_db() as conn:
        conn.cursor().execute("INSERT INTO chat_prefs (username, room, muted) VALUES ('bob', 'club', TRUE)")
        conn.commit()
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', 'meeting at 5')
    assert sent == [['carol']]


# ── mark as read ──────────────────────────────────────────────


def test_marking_a_chat_read_clears_it_everywhere_without_opening_it():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    bob_phone, bob_laptop = connect_as('bob'), connect_as('bob')
    bob_phone.emit('join', {'room': 'club'})  # opened once: from here on, new messages are unread
    events(bob_phone, 'join_result')
    alice = connect_as('alice')
    join(alice, 'club')
    for text in ('one', 'two', 'three'):
        say(alice, 'club', text)
    assert rooms_list(bob_laptop)['club']['unread'] == 3
    bob_laptop.emit('mark_chat_read', {'room': 'club'})
    assert events(bob_phone, 'chat_read') == [{'room': 'club'}]
    assert rooms_list(bob_laptop)['club']['unread'] == 0


# ── search and photos ─────────────────────────────────────────


def test_search_finds_text_newest_first_and_skips_recalled_messages():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club')
    first = say(alice, 'club', 'Pizza tonight?')
    say(alice, 'club', 'nothing to see')
    gone = say(alice, 'club', 'pizza again')
    say(alice, 'club', 'PIZZA!!')
    alice.emit('recall_message', {'id': gone['id']})
    alice.emit('search_messages', {'room': 'club', 'q': 'pizza'})
    reply = events(alice, 'search_results')[0]
    assert [r['text'] for r in reply['results']] == ['PIZZA!!', 'Pizza tonight?']
    assert reply['results'][-1]['id'] == first['id'] and not reply['has_more']


def test_search_treats_wildcards_as_plain_text():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', '100% sure')
    say(alice, 'club', '100 percent')
    say(alice, 'club', 'snake_case')
    say(alice, 'club', 'snakeXcase')
    for q, expected in (('100%', ['100% sure']), ('e_c', ['snake_case'])):
        alice.emit('search_messages', {'room': 'club', 'q': q})
        assert [r['text'] for r in events(alice, 'search_results')[0]['results']] == expected


def test_search_pages_back_through_history():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club')
    with get_db() as conn:  # (faster than the send rate limit allows)
        cur = conn.cursor()
        for i in range(35):
            cur.execute(
                "INSERT INTO messages (room, username, screenname, text) VALUES ('club', 'alice', 'Alice', %s)",
                (f'note {i}',),
            )
        conn.commit()
    alice.emit('search_messages', {'room': 'club', 'q': 'note'})
    page = events(alice, 'search_results')[0]
    assert len(page['results']) == 30 and page['has_more']
    alice.emit('search_messages', {'room': 'club', 'q': 'note', 'before_id': page['results'][-1]['id']})
    rest = events(alice, 'search_results')[0]
    assert [r['text'] for r in rest['results']] == [f'note {i}' for i in range(4, -1, -1)] and not rest['has_more']


def test_only_chats_you_have_open_can_be_searched():
    create_user('alice')
    create_user('eve')
    create_room('club', 'alice', members=['alice'])
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', 'secret plan')
    eve = connect_as('eve')
    eve.emit('search_messages', {'room': 'club', 'q': 'secret'})
    assert events(eve, 'search_results')[0]['results'] == []
    eve.emit('get_chat_photos', {'room': 'club'})
    assert events(eve, 'chat_photos')[0]['photos'] == []
    stranger = anon_client()
    stranger.emit('search_messages', {'room': 'club', 'q': 'secret'})
    assert not events(stranger, 'search_results')


def test_the_photo_album_lists_sent_photos_until_recalled():
    create_user('alice')
    create_room('club', 'alice', members=['alice'])
    alice, token = login('alice')
    join(alice, 'club')
    from test_images import png, upload  # a real upload, as the chat does

    kept, gone = (upload(token, png()).get_json()['id'] for _ in range(2))
    alice.emit('message', {'room': 'club', 'text': '', 'image': kept})
    alice.emit('message', {'room': 'club', 'text': 'oops', 'image': gone})
    recalled = events(alice, 'message')[-1]['id']
    alice.emit('recall_message', {'id': recalled})
    alice.emit('get_chat_photos', {'room': 'club'})
    [photo] = events(alice, 'chat_photos')[0]['photos']
    assert photo['image']['id'] == kept and photo['username'] == 'alice'

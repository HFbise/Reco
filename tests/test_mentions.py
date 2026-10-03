"""@mentions: who counts as mentioned, the room list's "mentioned you", and notifications."""

import pytest
from conftest import connect_as, create_room, create_user, events, get_db, query

import handlers.messages
import mentions
import moderation
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


@pytest.fixture
def club():
    """alice, bob (Bobby) and carol in 'club'; dave exists but isn't in it."""
    create_user('alice', screenname='Alice')
    create_user('bob', screenname='Bobby')
    create_user('carol', screenname='Carol')
    create_user('dave', screenname='Dave')
    create_room('club', 'alice', members=['alice', 'bob', 'carol'])


@pytest.fixture
def pushes(monkeypatch):
    """Web pushes (users, title_code, params) and phone pushes (tokens, title) that would go out."""
    web, phone = [], []
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'k')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'k')
    monkeypatch.setattr(
        webpush,
        'notify',
        lambda users, title, body, url, tag, code='', title_code='', params=None: web.append(
            (list(users), title_code, params)
        ),
    )
    monkeypatch.setattr(handlers.messages, 'tokens_for', lambda users: sorted(users))
    monkeypatch.setattr(
        handlers.messages, 'send_push', lambda tokens, title, *a, **k: tokens and phone.append((tokens, title))
    )
    return web, phone


# ── what counts ───────────────────────────────────────────────


def test_names_are_read_from_the_text():
    assert mentions.candidates('hey @Bob and @carol, @bob again') == ['bob', 'carol']
    assert mentions.candidates('mail me at me@example.com or @@bob') == []
    assert mentions.candidates('@ab is too short, @dave_2 is fine.') == ['dave_2']
    assert len(mentions.candidates(' '.join(f'@user{i:02}' for i in range(30)))) == mentions.MAX_PER_MESSAGE


def test_only_people_in_the_room_are_mentioned(club):
    alice = connect_as('alice')
    join(alice, 'club')
    msg = say(alice, 'club', '@bob @dave @nobody look')
    assert msg['meta'] == {'mentions': {'bob': 'Bobby'}}
    assert query('SELECT meta FROM messages')[0]['meta'] == {'mentions': {'bob': 'Bobby'}}
    # and it comes back with the history
    bob = connect_as('bob')
    bob.emit('join', {'room': 'club'})
    assert [m['meta'] for m in events(bob, 'message')] == [{'mentions': {'bob': 'Bobby'}}]


def test_in_the_lobby_anyone_can_be_mentioned_but_not_in_a_dm(club):
    alice = connect_as('alice')
    join(alice, '大厅')
    assert say(alice, '大厅', 'hi @dave')['meta'] == {'mentions': {'dave': 'Dave'}}
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    assert say(alice, 'dm:alice:bob', 'hi @bob')['meta'] is None


def test_editing_a_message_updates_who_it_mentions(club):
    alice = connect_as('alice')
    join(alice, 'club')
    msg = say(alice, 'club', 'ask @bob')
    alice.emit('edit_message', {'id': msg['id'], 'text': 'ask @carol'})
    assert events(alice, 'message_edited')[-1]['mentions'] == {'carol': 'Carol'}
    alice.emit('edit_message', {'id': msg['id'], 'text': 'never mind'})
    assert events(alice, 'message_edited')[-1]['mentions'] == {}
    assert query('SELECT meta FROM messages')[0]['meta'] is None


def make_admin(room, username):
    with get_db() as conn:
        conn.cursor().execute('UPDATE rooms SET admins = admins || %s WHERE name = %s', ([username], room))
        conn.commit()


def test_owners_and_admins_can_mention_everyone(club):
    make_admin('club', 'carol')
    alice, bob, carol = connect_as('alice'), connect_as('bob'), connect_as('carol')
    for c in (alice, bob, carol):
        join(c, 'club')
    assert say(alice, 'club', '@everyone meeting at 6')['meta'] == {'everyone': True}
    assert say(carol, 'club', '@everyone and @bob')['meta'] == {'everyone': True, 'mentions': {'bob': 'Bobby'}}
    assert say(bob, 'club', '@everyone hi')['meta'] is None  # a plain member


def test_no_everyone_in_the_lobby_or_a_dm(club):
    alice = connect_as('alice')
    join(alice, '大厅')
    with get_db() as conn:
        conn.cursor().execute("UPDATE rooms SET owner = 'alice' WHERE name = '大厅'")
        conn.commit()
    assert say(alice, '大厅', '@everyone hi')['meta'] is None
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    assert say(alice, 'dm:alice:bob', '@everyone hi')['meta'] is None


def test_everyone_is_not_a_username():
    with get_db() as conn:
        assert not moderation.username_available(conn.cursor(), 'everyone')


def test_editing_adds_or_drops_everyone(club):
    alice = connect_as('alice')
    join(alice, 'club')
    msg = say(alice, 'club', 'meeting at 6')
    alice.emit('edit_message', {'id': msg['id'], 'text': '@everyone meeting at 6'})
    edited = events(alice, 'message_edited')[-1]
    assert edited['everyone'] and edited['mentions'] == {}
    assert query('SELECT meta FROM messages')[0]['meta'] == {'everyone': True}
    alice.emit('edit_message', {'id': msg['id'], 'text': 'meeting at 7'})
    assert not events(alice, 'message_edited')[-1]['everyone']
    assert query('SELECT meta FROM messages')[0]['meta'] is None


# ── "mentioned you" in the list ───────────────────────────────


def test_the_room_list_says_you_were_mentioned_until_you_read_it(club):
    bob = connect_as('bob')
    join(bob, 'club')  # opened once: from here on, new messages are unread
    bob.disconnect()
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', 'plain message')
    bob = connect_as('bob')
    assert not rooms_list(bob)['club']['mentioned']
    say(alice, 'club', '@bob your turn')
    assert rooms_list(bob)['club']['mentioned']
    assert not rooms_list(connect_as('carol'))['club']['mentioned']
    bob.emit('mark_chat_read', {'room': 'club'})
    assert not rooms_list(bob)['club']['mentioned']


def test_a_recalled_mention_no_longer_counts(club):
    bob = connect_as('bob')
    join(bob, 'club')
    alice = connect_as('alice')
    join(alice, 'club')
    msg = say(alice, 'club', '@bob oops')
    assert rooms_list(bob)['club']['mentioned']
    alice.emit('recall_message', {'id': msg['id']})
    assert not rooms_list(bob)['club']['mentioned']


# ── notifications ────────────────────────────────────────────


def test_a_mention_notifies_even_in_a_muted_room(club, pushes):
    web, phone = pushes
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO chat_prefs (username, room, muted) VALUES ('bob', 'club', TRUE), ('carol', 'club', TRUE)"
        )
        conn.commit()
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', '@bob can you check?')
    assert web == [(['bob'], 'mention', {'name': 'Alice', 'room': 'club'})]
    assert phone == [(['bob'], 'Alice mentioned you in club')]  # carol muted it and wasn't mentioned


def test_the_mentioned_get_the_mention_instead_of_the_usual_room_push(club, pushes):
    web, phone = pushes
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', '@bob hi all')
    assert phone == [(['carol'], 'Alice in club'), (['bob'], 'Alice mentioned you in club')]


def test_no_mention_push_when_turned_off_blocked_or_watching(club, pushes):
    web, phone = pushes
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET push_mentions = FALSE WHERE username = 'bob'")
        cur.execute("INSERT INTO blocks (blocker, blocked) VALUES ('carol', 'alice')")
        conn.commit()
    connect_as('dave')  # not in the room, so not mentioned at all
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', '@bob @carol @dave')
    assert web == [] and phone == [(['bob'], 'Alice in club')]  # bob still gets the usual one

    create_user('erin', screenname='Erin')
    with get_db() as conn:
        conn.cursor().execute("UPDATE rooms SET members = members || '{erin}' WHERE name = 'club'")
        conn.commit()
    connect_as('erin')  # has Reco open on screen
    say(alice, 'club', '@erin look')
    assert web == []


def test_everyone_tells_every_member_but_the_sender(club, pushes):
    web, phone = pushes
    with get_db() as conn:
        conn.cursor().execute("INSERT INTO chat_prefs (username, room, muted) VALUES ('carol', 'club', TRUE)")
        conn.commit()
    alice = connect_as('alice')
    join(alice, 'club')
    say(alice, 'club', '@everyone meeting at 6')
    assert web == [(['bob', 'carol'], 'mention', {'name': 'Alice', 'room': 'club'})]  # muted or not
    assert phone == [(['bob', 'carol'], 'Alice mentioned you in club')]
    assert rooms_list(connect_as('bob'))['club']['mentioned']
    assert not rooms_list(alice)['club']['mentioned']

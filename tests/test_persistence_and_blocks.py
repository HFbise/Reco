"""State that must survive restarts, server-side blocking, room passwords and invites."""

import pytest
from conftest import connect_as, create_room, create_user, events, get_db, query

import handlers.messages
import state


def join(client, room, password=''):
    client.emit('join', {'room': room, 'password': password, 'skip_history': True})
    return events(client, 'join_result')[0]


@pytest.fixture
def pushes(monkeypatch):
    """Capture push notifications instead of calling Expo."""
    sent = []
    monkeypatch.setattr(
        handlers.messages,
        'send_push',
        lambda tokens, title, body, data=None: sent.append((sorted(tokens), title)) if tokens else None,
    )
    return sent


def simulate_restart():
    """Everything in-process is gone after a restart; only the database remains."""
    for d in (state.online_users, state.rooms_voice, state.message_rate):
        d.clear()


# ── mutes & voice bans ────────────────────────────────────────


def test_mute_survives_a_restart():
    import moderation

    create_user('troll')
    troll = connect_as('troll')
    join(troll, '大厅')
    moderation.mute('大厅', 'troll', 3600)
    simulate_restart()
    troll = connect_as('troll')
    join(troll, '大厅')
    troll.emit('message', {'room': '大厅', 'text': 'still here?'})
    assert events(troll, 'text_muted_notify')
    assert query("SELECT * FROM messages WHERE text = 'still here?'") == []


def test_expired_mute_no_longer_applies():
    import moderation

    create_user('troll')
    troll = connect_as('troll')
    join(troll, '大厅')
    moderation.mute('大厅', 'troll', 3600)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE room_restrictions SET expires_at = NOW() - interval '1 second'")
        conn.commit()
    troll.emit('message', {'room': '大厅', 'text': 'back'})
    assert query("SELECT text FROM messages WHERE text = 'back'") == [{'text': 'back'}]


def test_voice_ban_blocks_joining_voice_until_lifted():
    import moderation

    create_user('owner')
    create_user('loud')
    create_room('club', owner='owner', members=['loud'])
    owner, loud = connect_as('owner'), connect_as('loud')
    join(owner, 'club')
    join(loud, 'club')

    owner.emit('voice_ban', {'room': 'club', 'target': 'loud', 'duration_seconds': 0})
    loud.get_received()
    loud.emit('voice_join', {'room': 'club'})
    assert events(loud, 'voice_banned') == [{'target': 'loud', 'room': 'club'}]
    assert state.rooms_voice.get('club', {}).get('voice_members', []) == []

    moderation.lift('club', 'loud', moderation.VOICE)
    loud.emit('voice_join', {'room': 'club'})
    assert [m['username'] for m in state.rooms_voice['club']['voice_members']] == ['loud']


# ── push tokens ───────────────────────────────────────────────

TOKEN = 'ExponentPushToken[device-1]'


def test_push_token_is_stored_for_the_session_user(pushes):
    create_user('alice')
    create_user('bob')
    bob = connect_as('bob')
    bob.emit('register_push_token', {'token': TOKEN, 'username': 'alice'})  # claimed name ignored
    assert query('SELECT username FROM push_tokens') == [{'username': 'bob'}]

    simulate_restart()  # bob is now offline, token still known
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'ping'})
    assert pushes == [([TOKEN], 'Alice')]


def test_device_switching_accounts_moves_the_token_and_logout_removes_it():
    create_user('alice')
    create_user('bob')
    alice = connect_as('alice')
    alice.emit('register_push_token', {'token': TOKEN})
    bob = connect_as('bob')
    bob.emit('register_push_token', {'token': TOKEN})
    assert query('SELECT username FROM push_tokens') == [{'username': 'bob'}]

    alice.emit('unregister_push_token', {'token': TOKEN})  # not alice's anymore: no effect
    assert query('SELECT username FROM push_tokens') == [{'username': 'bob'}]
    bob.emit('unregister_push_token', {'token': TOKEN})
    assert query('SELECT * FROM push_tokens') == []


# ── blocking ──────────────────────────────────────────────────


@pytest.mark.parametrize('blocker', ['alice', 'bob'])
def test_blocked_dm_is_refused_in_both_directions(blocker, pushes):
    create_user('alice')
    create_user('bob')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO blocks (blocker, blocked) VALUES (%s, %s)', (blocker, 'bob' if blocker == 'alice' else 'alice')
        )
        conn.commit()
    alice, bob = connect_as('alice'), connect_as('bob')
    bob.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    bob.get_received()
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'hello?'})

    assert events(alice, 'dm_blocked') == [{'room': 'dm:alice:bob'}]
    assert events(bob, 'new_dm_notification') == []
    assert query("SELECT * FROM messages WHERE text = 'hello?'") == []
    assert pushes == []


def test_room_pushes_skip_members_who_blocked_the_sender(pushes):
    for u in ('alice', 'bob', 'carol'):
        create_user(u)
    create_room('club', owner='alice', members=['alice', 'bob', 'carol'])
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO blocks (blocker, blocked) VALUES ('carol', 'alice')")
        cur.execute(
            "INSERT INTO push_tokens (token, username) VALUES ('ExponentPushToken[b]', 'bob'),"
            " ('ExponentPushToken[c]', 'carol')"
        )
        conn.commit()
    alice = connect_as('alice')
    join(alice, 'club')
    alice.emit('message', {'room': 'club', 'text': 'hi all'})
    assert pushes == [(['ExponentPushToken[b]'], 'Alice in club')]


# ── room passwords ────────────────────────────────────────────


def test_room_passwords_are_stored_hashed():
    create_user('owner')
    create_user('guest')
    owner = connect_as('owner')
    owner.emit('create_room', {'room': 'vault', 'password': 'open sesame'})
    stored = query("SELECT password FROM rooms WHERE name = 'vault'")[0]['password']
    assert stored.startswith('scrypt:')

    guest = connect_as('guest')
    assert join(guest, 'vault', 'wrong')['success'] is False
    assert join(guest, 'vault', 'open sesame')['success']


def test_legacy_plaintext_room_password_is_upgraded_on_first_correct_entry():
    create_user('owner')
    create_user('guest')
    create_room('vault', owner='owner', password='old-plain')
    assert join(connect_as('guest'), 'vault', 'old-plain')['success']
    assert query("SELECT password FROM rooms WHERE name = 'vault'")[0]['password'].startswith('scrypt:')


# ── invites ───────────────────────────────────────────────────


def test_invite_lets_someone_into_a_password_room_once():
    create_user('owner')
    create_user('friend')
    create_room('vault', owner='owner', password='pw')
    owner, friend = connect_as('owner'), connect_as('friend')
    join(owner, 'vault')
    owner.emit('invite_to_room', {'target': 'friend', 'room': 'vault'})
    assert events(owner, 'invite_sent')[0]['success']

    code = query("SELECT code FROM rooms WHERE name = 'vault'")[0]['code']
    friend.emit('find_room', {'code': code})
    assert events(friend, 'find_room_result')[0]['needs_password'] is False
    assert join(friend, 'vault')['success']  # no password needed
    assert query('SELECT * FROM room_invites') == []  # the pass is used up


def test_cannot_invite_someone_who_blocked_you():
    create_user('owner')
    create_user('friend')
    create_room('vault', owner='owner', password='pw')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO blocks (blocker, blocked) VALUES ('friend', 'owner')")
        conn.commit()
    owner = connect_as('owner')
    join(owner, 'vault')
    owner.emit('invite_to_room', {'target': 'friend', 'room': 'vault'})
    assert events(owner, 'invite_sent')[0]['success'] is False
    assert query('SELECT * FROM room_invites') == []


def test_rename_carries_push_tokens_and_restrictions():
    import moderation

    create_user('admin')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO push_tokens (token, username) VALUES ('ExponentPushToken[x]', 'admin')")
        conn.commit()
    moderation.mute('大厅', 'admin', 0)
    assert moderation.rename_user('admin', 'bise') is None
    assert query('SELECT username FROM push_tokens') == [{'username': 'bise'}]
    assert moderation.is_muted('大厅', 'bise')

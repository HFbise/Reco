"""Random matching end to end over Socket.IO: pairing, anonymity, keep-in-touch, safety."""

import json

import pytest
from conftest import connect_as, create_user, events, get_db, query

import handlers.match as match_handlers


def enqueue(client, mode='text', tags=()):
    client.emit('match_enqueue', {'mode': mode, 'tags': list(tags)})


@pytest.fixture
def pair():
    """Two users matched with each other: returns (alice, bob) clients."""
    for u, sn in (('alice', 'Alice'), ('bob', 'Bob')):
        create_user(u, screenname=sn)
    alice, bob = connect_as('alice'), connect_as('bob')
    enqueue(alice)
    assert events(alice, 'match_waiting')
    enqueue(bob)
    return alice, bob


def dump(received) -> str:
    return json.dumps([e['args'] for e in received], ensure_ascii=False)


def test_two_waiting_users_get_matched(pair):
    alice, bob = pair
    a_found, b_found = events(alice, 'match_found')[0], events(bob, 'match_found')[0]
    assert a_found['match_id'] == b_found['match_id']
    assert {a_found['initiator'], b_found['initiator']} == {True, False}
    assert query('SELECT user_a, user_b, mode FROM matches') == [{'user_a': 'alice', 'user_b': 'bob', 'mode': 'text'}]


def test_nothing_sent_to_a_matched_user_reveals_the_other_identity(pair):
    alice, bob = pair
    alice.get_received()
    bob.emit('match_message', {'text': 'hi there'})
    bob.emit('match_typing', {})
    received = alice.get_received()
    assert [m for e in received if e['name'] == 'match_message' for m in e['args']][0]['from'] == 'stranger'
    blob = dump(received).lower()
    assert 'bob' not in blob and 'alice' not in blob


def test_stranger_avatar_is_random_not_the_real_one(pair):
    alice, _ = pair
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET avatar_color = '#123456'")
        conn.commit()
    found = events(alice, 'match_found')[0]
    assert found['stranger']['color'] in match_handlers.COLORS
    assert found['stranger']['expression'] in match_handlers.LOGO_EXPRESSIONS  # not the avatar-only faces


def test_messages_are_stored_with_real_identity_for_moderation(pair):
    _, bob = pair
    bob.emit('match_message', {'text': 'hello'})
    row = query("SELECT room, username FROM messages WHERE text = 'hello'")[0]
    assert row['room'].startswith('match:') and row['username'] == 'bob'


def test_next_ends_the_match_and_requeues(pair):
    alice, bob = pair
    alice.get_received()
    bob.emit('match_next', {})
    assert events(alice, 'match_ended')[0]['reason'] == 'partner_left'
    assert events(bob, 'match_waiting')
    # ...and they aren't paired straight back together
    enqueue(alice)
    assert events(alice, 'match_found') == []


def test_keep_in_touch_needs_both_sides(pair):
    alice, bob = pair
    alice.get_received()
    bob.get_received()
    alice.emit('match_keep', {})
    assert events(bob, 'match_revealed') == [] and events(alice, 'match_revealed') == []  # one-sided: silent
    bob.emit('match_keep', {})
    a_rev, b_rev = events(alice, 'match_revealed')[0], events(bob, 'match_revealed')[0]
    assert a_rev['username'] == 'bob' and b_rev['username'] == 'alice'
    assert a_rev['dm_room'] == b_rev['dm_room'] == 'dm:alice:bob'
    # The DM exists for both (a first message was posted into it)
    alice.emit('get_dms', {})
    assert [d['dm_room'] for d in events(alice, 'dms_list')[0]['dms']] == ['dm:alice:bob']


def test_report_records_blocks_and_ends(pair):
    alice, bob = pair
    alice.get_received()
    bob.emit('match_message', {'text': 'rude thing'})
    alice.emit('match_report', {'reason': 'harassment'})
    report = query('SELECT reporter, reported, match_id FROM reports')[0]
    assert (report['reporter'], report['reported']) == ('alice', 'bob') and report['match_id']
    assert query('SELECT blocker, blocked FROM blocks') == [{'blocker': 'alice', 'blocked': 'bob'}]
    assert events(bob, 'match_ended')[0]['reason'] == 'partner_left'


def test_blocked_users_are_never_matched():
    for u in ('alice', 'bob'):
        create_user(u)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO blocks (blocker, blocked) VALUES ('bob', 'alice')")
        conn.commit()
    alice, bob = connect_as('alice'), connect_as('bob')
    enqueue(alice)
    enqueue(bob)
    names = [e['name'] for e in bob.get_received()]
    assert 'match_found' not in names and 'match_waiting' in names


def test_shared_interests_are_reported_to_both(monkeypatch):
    for u in ('alice', 'bob'):
        create_user(u)
    alice, bob = connect_as('alice'), connect_as('bob')
    enqueue(alice, tags=['Music', 'chess'])
    enqueue(bob, tags=['music'])
    assert events(bob, 'match_found')[0]['shared_tags'] == ['music']


def test_disconnect_ends_the_match_for_the_partner(pair):
    alice, bob = pair
    alice.get_received()
    bob.disconnect()
    assert events(alice, 'match_ended')[0]['reason'] == 'partner_left'
    assert 'alice' not in match_handlers._live


def test_voice_signals_reach_only_the_partner():
    for u in ('alice', 'bob', 'carol'):
        create_user(u)
    alice, bob, carol = connect_as('alice'), connect_as('bob'), connect_as('carol')
    enqueue(alice, mode='voice')
    enqueue(bob, mode='voice')
    alice.get_received()
    carol.get_received()
    bob.emit('match_signal', {'type': 'offer', 'payload': {'sdp': 'x'}})
    assert events(alice, 'match_signal') == [{'type': 'offer', 'payload': {'sdp': 'x'}}]
    assert events(carol, 'match_signal') == []


def test_cannot_message_without_a_match():
    create_user('alice')
    alice = connect_as('alice')
    alice.emit('match_message', {'text': 'into the void'})
    assert query("SELECT * FROM messages WHERE text = 'into the void'") == []


def test_expired_transcripts_are_purged(pair):
    _, bob = pair
    bob.emit('match_message', {'text': 'old news'})
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE messages SET created_at = NOW() - interval '8 days' WHERE room LIKE 'match:%'")
        cur.execute("UPDATE matches SET started_at = NOW() - interval '8 days'")
        conn.commit()
    match_handlers.purge_expired()
    assert query("SELECT * FROM messages WHERE room LIKE 'match:%%'") == []
    assert query('SELECT * FROM matches') == []


def test_admin_can_read_a_reported_match_transcript(pair):
    from conftest import app

    alice, bob = pair
    bob.emit('match_message', {'text': 'something awful'})
    alice.emit('match_report', {'reason': 'abuse'})
    web = app.test_client()
    web.post('/admin/login', data={'password': 'test-admin'})
    reports = web.get('/admin/reports').get_data(as_text=True)
    match_id = query('SELECT match_id FROM reports')[0]['match_id']
    assert f'/admin/matches/{match_id}' in reports
    transcript = web.get(f'/admin/matches/{match_id}').get_data(as_text=True)
    assert 'something awful' in transcript and 'bob' in transcript


def test_demo_guests_can_look_at_matching_but_never_join_the_queue():
    from conftest import anon_client

    create_user('alice')
    alice = connect_as('alice')
    guest = anon_client()
    guest.emit('guest_login', {})
    guest.get_received()
    guest.emit('match_enqueue', {'mode': 'text', 'tags': []})
    assert events(guest, 'guest_read_only')
    enqueue(alice)
    # Alice waits alone: the guest never entered the queue
    assert events(alice, 'match_found') == []
    assert events(guest, 'match_found') == []

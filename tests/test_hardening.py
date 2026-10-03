"""Limits and checks that keep one person from spoiling things for others: editing after being
kicked, DMs under a second id, guessing passwords, scripted sign-ups, flooding a voice room or the
moderators, and a session that would otherwise end after 30 days in use."""

import time

import itsdangerous.timed
from conftest import anon_client, app, connect_as, create_room, create_user, events, login, query, socketio

import auth_session
from auth_session import make_token


def join(client, room):
    client.emit('join', {'room': room, 'skip_history': True})
    assert events(client, 'join_result')[0]['success']


def say(client, room, text):
    client.emit('message', {'room': room, 'text': text})
    return query('SELECT id FROM messages WHERE text = %s', text)[0]['id']


# ── editing ───────────────────────────────────────────────────


def test_no_editing_after_being_kicked_or_while_muted():
    create_user('owner')
    create_user('alice')
    create_room('club', 'owner', members=['owner', 'alice'])
    owner, alice = connect_as('owner'), connect_as('alice')
    join(owner, 'club')
    join(alice, 'club')
    first, second = say(alice, 'club', 'one'), say(alice, 'club', 'two')

    owner.emit('mute_member', {'room': 'club', 'target': 'alice', 'duration': 600})
    owner.emit('text_mute', {'room': 'club', 'target': 'alice', 'duration': 600})
    alice.emit('edit_message', {'id': first, 'text': 'changed while muted'})
    owner.emit('text_unmute', {'room': 'club', 'target': 'alice'})
    owner.emit('kick_member', {'room': 'club', 'target': 'alice'})
    alice.emit('edit_message', {'id': second, 'text': 'changed after the kick'})
    assert [r['text'] for r in query('SELECT text FROM messages WHERE id = ANY(%s) ORDER BY id', [first, second])] == [
        'one',
        'two',
    ]


# ── DMs ───────────────────────────────────────────────────────


def test_a_dm_has_one_id_and_a_real_other_person():
    create_user('alice')
    create_user('bob')
    alice = connect_as('alice')
    for room in ('dm:bob:alice', 'dm:alice:alice', 'dm:alice:ghost'):
        alice.emit('join_dm', {'dm_room': room})
        alice.emit('message', {'room': room, 'text': f'hi in {room}'})
    assert query("SELECT room FROM messages WHERE room LIKE 'dm:%%'") == []
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'hi'})
    assert query("SELECT room FROM messages WHERE room LIKE 'dm:%%'") == [{'room': 'dm:alice:bob'}]


# ── passwords and sign-ups ────────────────────────────────────


def test_a_forgotten_password_is_found_with_capitals_too():
    create_user('alice', answer='blue')
    client = anon_client()
    client.emit('get_security_question', {'username': 'Alice'})
    assert events(client, 'security_question_result')[0]['success']
    client.emit('reset_password', {'username': 'ALICE', 'answer': 'blue', 'new_password': 'brandnew1'})
    assert events(client, 'reset_password_result')[0]['success']
    login('alice', 'brandnew1')


def test_one_address_trying_many_usernames_has_to_wait():
    create_user('alice')
    client = anon_client()
    for i in range(30):  # a different username each time: no single account's lock applies
        client.emit('login', {'username': f'guess{i}', 'password': 'secret123'})
    assert {r['code'] for r in events(client, 'login_result')} == {'user_not_found'}
    client.emit('login', {'username': 'alice', 'password': 'secret123'})  # now everything from here waits
    assert events(client, 'login_result')[0]['code'] == 'too_many_attempts'


def test_sign_ups_from_one_address_are_limited():
    client = anon_client()
    for i in range(6):
        client.emit(
            'register',
            {
                'username': f'newbie{i}',
                'screenname': 'N',
                'password': 'secret123',
                'security_question': 'pet_name',
                'security_answer': 'cat',
            },
        )
    results = events(client, 'register_result')
    assert [r['success'] for r in results[:5]] == [True] * 5
    assert results[5]['code'] == 'too_many_signups'


def test_admin_sign_in_has_a_limit_no_address_can_dodge():
    web = app.test_client()
    for i in range(30):  # each from a different (claimed) address
        web.post('/admin/login', data={'password': 'wrong'}, headers={'X-Forwarded-For': f'10.0.0.{i}'})
    res = web.post('/admin/login', data={'password': 'test-admin'}, headers={'X-Forwarded-For': '10.9.9.9'})
    assert res.status_code == 429


# ── voice and reports ─────────────────────────────────────────


def test_voice_status_carries_only_its_own_fields_and_speaking_is_capped():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    for c in (alice, bob):
        join(c, 'club')
        c.emit('voice_join', {'room': 'club'})
    bob.get_received()
    alice.emit('voice_mute_status', {'room': 'club', 'muted': True, 'screenname': 'Admin', 'extra': 'x' * 1000})
    assert events(bob, 'voice_mute_status') == [{'room': 'club', 'username': 'alice', 'muted': True}]
    for _ in range(60):
        alice.emit('voice_speaking', {'room': 'club', 'speaking': True})
    assert len(events(bob, 'voice_speaking')) == 40
    alice.emit('voice_speaking', {'room': 'club', 'speaking': False})  # "stopped" always gets through
    assert events(bob, 'voice_speaking') == [{'room': 'club', 'username': 'alice', 'speaking': False}]


def test_reports_are_limited():
    create_user('alice')
    for i in range(6):
        create_user(f'target{i}')
    alice = connect_as('alice')
    for i in range(6):
        alice.emit('report_user', {'reported': f'target{i}', 'reason': 'spam'})
    results = events(alice, 'report_result')
    assert [r['success'] for r in results] == [True] * 5 + [False]
    assert results[5]['code'] == 'too_many_reports'
    assert len(query('SELECT * FROM reports')) == 5


# ── sessions ──────────────────────────────────────────────────


def test_a_session_in_use_gets_a_fresh_token_once_a_day(monkeypatch):
    create_user('alice')
    password = query("SELECT password FROM users WHERE username = 'alice'")[0]['password']
    token = make_token('alice', password)
    fresh = socketio.test_client(app, auth={'token': token})
    assert 'token' not in events(fresh, 'session_ready')[0]  # a new one isn't swapped

    class TwoDaysAgo:  # the clock itsdangerous stamps tokens with
        @staticmethod
        def time():
            return time.time() - 2 * 86400

    monkeypatch.setattr(itsdangerous.timed, 'time', TwoDaysAgo)
    old = make_token('alice', password)
    monkeypatch.undo()
    ready = events(socketio.test_client(app, auth={'token': old}), 'session_ready')[0]
    assert ready['username'] == 'alice' and ready['token'] != old
    assert auth_session.verify_token(ready['token']) == 'alice'


# ── the site admin suspends an account ────────────────────────


def admin():
    web = app.test_client()
    assert web.post('/admin/login', data={'password': 'test-admin'}).status_code == 302
    return web


def test_a_suspended_account_is_signed_out_and_kept_out_until_lifted():
    create_user('alice')
    alice = connect_as('alice')
    web = admin()
    web.post('/admin/users/alice/suspend', data={'days': '7', 'reason': 'spam'})
    assert events(alice, 'session_expired') == [{}]  # every device signed out at once
    until = query("SELECT suspended_until, suspend_reason FROM users WHERE username = 'alice'")[0]
    assert until['suspend_reason'] == 'spam'

    client = anon_client()
    client.emit('login', {'username': 'alice', 'password': 'secret123'})
    reply = events(client, 'login_result')[0]
    assert reply['code'] == 'account_suspended' and reply['params']['until'] == until['suspended_until'].strftime(
        '%Y-%m-%d'
    )
    client.emit('login', {'username': 'alice', 'password': 'wrong'})  # a guesser isn't told
    assert events(client, 'login_result')[0]['code'] == 'wrong_password'

    web.post('/admin/users/alice/unsuspend')
    login('alice')


def test_a_ban_has_no_end_and_old_tokens_stop_working():
    create_user('alice')
    _, token = login('alice')
    admin().post('/admin/users/alice/suspend', data={'days': '0'})
    assert auth_session.verify_token(token) is None
    client = anon_client()
    client.emit('login', {'username': 'alice', 'password': 'secret123'})
    assert events(client, 'login_result')[0]['code'] == 'account_banned'
    assert '永久封禁' in admin().get('/admin/users').get_data(as_text=True)


def test_suspending_ends_a_live_match():
    import handlers.match as match_handlers

    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    for c in (alice, bob):
        c.emit('match_enqueue', {'mode': 'text', 'tags': []})
    assert 'bob' in match_handlers._live
    admin().post('/admin/users/bob/suspend', data={'days': '1'})
    assert 'bob' not in match_handlers._live and 'alice' not in match_handlers._live
    assert events(alice, 'match_ended')[0]['reason'] == 'partner_left'


# ── reporting a message ───────────────────────────────────────


def test_a_reported_message_is_kept_as_it_was_said():
    create_user('alice')
    create_user('bob')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, bob = connect_as('alice'), connect_as('bob')
    join(alice, 'club')
    join(bob, 'club')
    msg_id = say(bob, 'club', 'something nasty')
    alice.emit('report_user', {'reported': 'bob', 'reason': '', 'message_id': msg_id})
    assert events(alice, 'report_result')[0]['success']
    bob.emit('edit_message', {'id': msg_id, 'text': 'something nice'})
    bob.emit('recall_message', {'id': msg_id})
    report = query('SELECT reported, room, message_id, message_text FROM reports')[0]
    assert report == {'reported': 'bob', 'room': 'club', 'message_id': msg_id, 'message_text': 'something nasty'}
    assert 'something nasty' in admin().get('/admin/reports').get_data(as_text=True)


def test_only_a_message_you_can_see_by_the_person_named_can_be_reported():
    create_user('alice')
    create_user('bob')
    create_user('eve')
    create_room('club', 'alice', members=['alice', 'bob'])
    alice, eve = connect_as('alice'), connect_as('eve')
    join(alice, 'club')
    msg_id = say(alice, 'club', 'members only')
    eve.emit('report_user', {'reported': 'alice', 'reason': '', 'message_id': msg_id})  # not in the room
    bob = connect_as('bob')
    bob.emit('report_user', {'reported': 'eve', 'reason': '', 'message_id': msg_id})  # not eve's message
    assert events(eve, 'report_result')[0]['code'] == 'report_failed'
    assert events(bob, 'report_result')[0]['code'] == 'report_failed'
    assert query('SELECT * FROM reports') == []

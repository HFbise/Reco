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

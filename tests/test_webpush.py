"""Browser push notifications. Delivery to the push service is faked at pywebpush's call."""

import json
import urllib.parse

import pytest
from conftest import anon_client, connect_as, create_user, events, login, query

import webpush
from extensions import app

CHROME = 'https://fcm.googleapis.com/fcm/send/abc123'
FIREFOX = 'https://updates.push.services.mozilla.com/wpush/v2/xyz'


@pytest.fixture(autouse=True)
def vapid(monkeypatch):
    monkeypatch.setenv('VAPID_PUBLIC_KEY', 'test-public-key')
    monkeypatch.setenv('VAPID_PRIVATE_KEY', 'test-private-key')
    monkeypatch.setattr(webpush, 'BACKGROUND', False)


@pytest.fixture
def sent(monkeypatch):
    """Every notification handed to the push service: (endpoint, payload)."""
    calls = []

    def fake_webpush(subscription_info, data, **kwargs):
        assert kwargs['vapid_private_key'] == 'test-private-key'
        calls.append((subscription_info['endpoint'], json.loads(data)))

    monkeypatch.setattr(webpush, 'webpush', fake_webpush)
    return calls


def subscribe(token, endpoint=CHROME):
    return app.test_client().post(
        '/api/push/subscribe',
        headers={'Authorization': f'Bearer {token}'},
        json={'endpoint': endpoint, 'keys': {'p256dh': 'BPk3y', 'auth': 'secret'}},
    )


def dm_pair():
    """bob (signed in on a subscribed browser) and a socket for alice to DM him from."""
    create_user('alice', screenname='Alice')
    create_user('bob')
    bob, token = login('bob')
    assert subscribe(token).status_code == 204
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    return alice, bob


# ── subscriptions ─────────────────────────────────────────────


def test_the_key_is_offered_only_when_push_is_configured(monkeypatch):
    assert app.test_client().get('/api/push/config').get_json() == {'key': 'test-public-key'}
    monkeypatch.delenv('VAPID_PRIVATE_KEY')
    assert app.test_client().get('/api/push/config').get_json() == {'key': None}


def test_subscribing_needs_an_account():
    assert subscribe('nope').status_code == 401
    guest = anon_client()
    guest.emit('guest_login', {})
    assert subscribe(events(guest, 'guest_login_result')[0]['token']).status_code == 401
    assert query('SELECT * FROM web_push_subscriptions') == []


@pytest.mark.parametrize(
    'endpoint',
    [
        'http://fcm.googleapis.com/fcm/send/x',  # not https
        'https://169.254.169.254/latest/meta-data',  # somewhere internal
        'https://fcm.googleapis.com.evil.test/x',  # lookalike host
        'https://localhost/x',
        'not a url',
    ],
)
def test_only_real_push_services_are_accepted(endpoint):
    create_user('alice')
    _, token = login('alice')
    assert subscribe(token, endpoint).status_code == 400
    assert query('SELECT * FROM web_push_subscriptions') == []


@pytest.mark.parametrize(
    'endpoint',
    [
        CHROME,
        FIREFOX,
        'https://jmt17.google.com/fcm/send/cRSNX7',  # Chromium
        'https://web.push.apple.com/QGuQ',  # Safari
        'https://wns2-by3p.notify.windows.com/w/?token=x',  # legacy Edge
    ],
)
def test_the_push_services_of_real_browsers_are_accepted(endpoint):
    create_user('alice')
    _, token = login('alice')
    assert subscribe(token, endpoint).status_code == 204


def test_a_browser_belongs_to_whoever_signed_in_last():
    create_user('alice')
    create_user('bob')
    _, alice = login('alice')
    _, bob = login('bob')
    subscribe(alice)
    subscribe(bob)
    assert query('SELECT username FROM web_push_subscriptions') == [{'username': 'bob'}]


def test_unsubscribing_only_removes_your_own_browser():
    create_user('alice')
    create_user('bob')
    _, alice = login('alice')
    _, bob = login('bob')
    subscribe(alice, CHROME)
    http = app.test_client()
    http.post('/api/push/unsubscribe', headers={'Authorization': f'Bearer {bob}'}, json={'endpoint': CHROME})
    assert len(query('SELECT * FROM web_push_subscriptions')) == 1
    http.post('/api/push/unsubscribe', headers={'Authorization': f'Bearer {alice}'}, json={'endpoint': CHROME})
    assert query('SELECT * FROM web_push_subscriptions') == []


# ── when a notification goes out ──────────────────────────────


def test_a_dm_to_someone_who_is_away_is_pushed(sent):
    create_user('alice', screenname='Alice')
    create_user('bob')
    bob, token = login('bob')
    subscribe(token)
    bob.disconnect()  # closed the tab
    alice = connect_as('alice')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'are you around?'})
    [(endpoint, payload)] = sent
    assert endpoint == CHROME
    assert payload['title'] == 'Alice' and payload['body'] == 'are you around?'
    assert payload['tag'] == 'dm:alice:bob'
    path, _, params = payload['url'].partition('?')
    assert path == '/room/dm%3Aalice%3Abob'
    assert dict(urllib.parse.parse_qsl(params))['otherUsername'] == 'alice'


def test_no_push_while_the_chat_is_on_screen_but_one_when_the_tab_is_hidden(sent):
    alice, bob = dm_pair()
    bob.emit('page_visibility', {'hidden': False})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'hi'})
    assert sent == []  # bob sees it in the app
    bob.emit('page_visibility', {'hidden': True})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'still there?'})
    assert [p['body'] for _, p in sent] == ['still there?']
    bob.emit('page_visibility', {'hidden': False})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'ok'})
    assert len(sent) == 1


def test_room_messages_are_not_pushed(sent):
    create_user('alice')
    create_user('bob')
    _, token = login('bob')
    subscribe(token)
    alice = connect_as('alice')
    alice.emit('join', {'room': '大厅', 'skip_history': True})
    alice.emit('message', {'room': '大厅', 'text': 'hello room'})
    assert sent == []


def test_an_expired_subscription_is_forgotten(monkeypatch):
    class Gone:
        status_code = 410

    def expired(*_args, **_kwargs):
        raise webpush.WebPushException('gone', response=Gone())

    monkeypatch.setattr(webpush, 'webpush', expired)
    alice, bob = dm_pair()
    bob.disconnect()
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'hello?'})
    assert query('SELECT * FROM web_push_subscriptions') == []


def test_a_match_found_in_a_background_tab_is_pushed(sent):
    create_user('alice')
    create_user('bob')
    alice, token = login('alice')
    subscribe(token)
    alice.emit('page_visibility', {'hidden': True})
    alice.emit('match_enqueue', {'mode': 'text', 'tags': []})
    bob = connect_as('bob')
    bob.emit('match_enqueue', {'mode': 'text', 'tags': []})
    assert [(p['url'], p['code']) for _, p in sent] == [('/match', 'match_found')]


def test_deleting_the_account_drops_its_browsers():
    create_user('alice')
    client, token = login('alice')
    subscribe(token)
    client.emit('delete_account', {'password': 'secret123'})
    assert query('SELECT * FROM web_push_subscriptions') == []

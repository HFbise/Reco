"""Sign in with GitHub / Google. The provider's side is faked at the HTTP call."""

import urllib.parse

import pytest
from conftest import anon_client, connect_as, create_user, events, login, query

import oauth
from extensions import app, socketio

GITHUB_ADA = {'id': 42, 'login': 'Ada-Lovelace', 'name': 'Ada Lovelace'}


@pytest.fixture(autouse=True)
def providers(monkeypatch):
    monkeypatch.setenv('GITHUB_CLIENT_ID', 'gh-id')
    monkeypatch.setenv('GITHUB_CLIENT_SECRET', 'gh-secret')
    monkeypatch.setenv('PUBLIC_URL', 'https://reco.test')
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    monkeypatch.delenv('APP_URL', raising=False)
    oauth._used_nonces.clear()


@pytest.fixture
def provider_account(monkeypatch):
    """Which account the fake provider says signed in; set .profile to switch."""

    class Fake:
        profile = GITHUB_ADA
        calls = []

    def http_json(url, data=None, token=None):
        Fake.calls.append(url)
        if data is not None:
            assert data['code'] == 'good-code' and data['client_secret'] == 'gh-secret'
            return {'access_token': 'provider-token'}
        assert token == 'provider-token'
        return Fake.profile

    monkeypatch.setattr(oauth, '_http_json', http_json)
    return Fake


def fragment(response) -> dict:
    location = response.headers['Location']
    assert location.startswith('https://reco.test/oauth#'), location
    return dict(urllib.parse.parse_qsl(location.split('#', 1)[1]))


def sign_in_with_github(http=None, start=None):
    """Go out to GitHub and come back as the fake provider's account."""
    http = http or app.test_client()
    out = start(http) if start else http.get('/auth/github')
    location = out.headers['Location'] if start is None else out.get_json()['url']
    state = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(location).query))['state']
    return fragment(http.get(f'/auth/github/callback?code=good-code&state={state}'))


def register(result, username=None, screenname='Ada'):
    client = anon_client()
    client.emit(
        'oauth_register',
        {'ticket': result['signup'], 'username': username or result['username'], 'screenname': screenname},
    )
    return client, events(client, 'oauth_register_result')[0]


# ── the redirect flow ─────────────────────────────────────────


def test_only_configured_providers_are_offered():
    assert app.test_client().get('/api/auth/providers').get_json() == {'providers': ['github']}
    assert fragment(app.test_client().get('/auth/google')) == {'error': 'oauth_unavailable'}


def test_the_trip_out_carries_a_state_that_the_trip_back_must_match(provider_account):
    http = app.test_client()
    out = http.get('/auth/github')
    params = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(out.headers['Location']).query))
    assert out.headers['Location'].startswith('https://github.com/login/oauth/authorize?')
    assert params['client_id'] == 'gh-id'
    assert params['redirect_uri'] == 'https://reco.test/auth/github/callback'
    cookie = out.headers['Set-Cookie']
    assert 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=Lax' in cookie

    # A forged callback (someone else's code, a state we never issued) goes nowhere
    assert fragment(http.get('/auth/github/callback?code=good-code&state=forged')) == {'error': 'oauth_expired'}
    assert fragment(app.test_client().get(f'/auth/github/callback?code=good-code&state={params["state"]}')) == {
        'error': 'oauth_expired'  # right state, but not this browser's cookie
    }
    assert provider_account.calls == []  # never reached the provider


def test_cancelling_at_the_provider_comes_back_quietly(provider_account):
    http = app.test_client()
    state = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(http.get('/auth/github').headers['Location']).query))[
        'state'
    ]
    assert fragment(http.get(f'/auth/github/callback?error=access_denied&state={state}')) == {
        'error': 'oauth_cancelled'
    }


def test_a_provider_failure_is_reported_not_raised(monkeypatch):
    def broken(*_args, **_kwargs):
        raise ValueError('bad verification code')

    monkeypatch.setattr(oauth, '_http_json', broken)
    assert sign_in_with_github() == {'error': 'oauth_failed'}


# ── new accounts ──────────────────────────────────────────────


def test_a_new_github_account_picks_a_username_then_is_signed_in(provider_account):
    result = sign_in_with_github()
    assert result['username'] == 'ada_lovelace' and result['screenname'] == 'Ada Lovelace'
    assert result['provider'] == 'github'
    client, reply = register(result)
    assert reply['success'] and reply['username'] == 'ada_lovelace' and reply['token']
    assert query('SELECT provider, provider_id, username FROM oauth_accounts') == [
        {'provider': 'github', 'provider_id': '42', 'username': 'ada_lovelace'}
    ]
    # The token works like any other
    again = socketio.test_client(app, auth={'token': reply['token']})
    again.emit('get_rooms', {})
    assert events(again, 'rooms_list')

    # Next time the same GitHub account signs straight in
    result = sign_in_with_github()
    assert set(result) == {'login'}
    client = anon_client()
    client.emit('oauth_login', {'ticket': result['login']})
    assert events(client, 'oauth_login_result')[0]['username'] == 'ada_lovelace'
    # A ticket works once
    client.emit('oauth_login', {'ticket': result['login']})
    assert events(client, 'oauth_login_result')[0]['code'] == 'oauth_expired'


def test_the_suggested_username_steps_around_taken_ones(provider_account):
    create_user('ada_lovelace')
    result = sign_in_with_github()
    assert result['username'].startswith('ada_lovelace'[:16]) and result['username'] != 'ada_lovelace'
    _, reply = register(result, username='ada_lovelace')
    assert reply['code'] == 'username_taken'
    _, reply = register(result, username='Bad Name!')
    assert reply['code'] == 'invalid_username'
    _, reply = register(result)
    assert reply['success']


def test_a_signup_ticket_makes_one_account(provider_account):
    result = sign_in_with_github()
    assert register(result)[1]['success']
    assert register(result, username='ada2')[1]['code'] == 'already_linked'
    assert query("SELECT username FROM users WHERE username = 'ada2'") == []


def test_forged_tickets_are_refused():
    client = anon_client()
    client.emit('oauth_login', {'ticket': 'nope'})
    assert events(client, 'oauth_login_result')[0]['code'] == 'oauth_expired'
    client.emit('oauth_register', {'ticket': 'nope', 'username': 'mallory', 'screenname': 'M'})
    assert events(client, 'oauth_register_result')[0]['code'] == 'oauth_expired'


def test_an_account_without_a_password_says_so_and_can_set_one(provider_account):
    result = sign_in_with_github()
    client, reply = register(result)
    stranger = anon_client()
    stranger.emit('login', {'username': 'ada_lovelace', 'password': 'whatever1'})
    assert events(stranger, 'login_result')[0]['code'] == 'no_password'
    stranger.emit('get_security_question', {'username': 'ada_lovelace'})
    assert events(stranger, 'security_question_result')[0]['code'] == 'no_password'
    stranger.emit('reset_password', {'username': 'ada_lovelace', 'answer': 'x', 'new_password': 'hijacked1'})
    assert events(stranger, 'reset_password_result')[0]['code'] == 'no_password'

    # No old password to give the first time
    client.emit('change_password', {'old_password': '', 'new_password': 'mypassword'})
    assert events(client, 'change_password_result')[0]['success']
    login('ada_lovelace', 'mypassword')
    # From then on the old one is required
    client.emit('change_password', {'old_password': '', 'new_password': 'another1'})
    assert events(client, 'change_password_result')[0]['code'] == 'wrong_old_password'


def test_a_login_ticket_goes_stale_when_the_password_changes(provider_account):
    client, _ = register(sign_in_with_github())
    ticket = sign_in_with_github()['login']
    client.emit('change_password', {'old_password': '', 'new_password': 'mypassword'})
    events(client, 'change_password_result')
    other = anon_client()
    other.emit('oauth_login', {'ticket': ticket})
    assert events(other, 'oauth_login_result')[0]['code'] == 'oauth_expired'


def test_deleting_an_account_without_a_password_is_confirmed_by_its_name(provider_account):
    client, _ = register(sign_in_with_github())
    client.emit('delete_account', {'password': 'someone_else'})
    assert events(client, 'delete_account_result')[0]['code'] == 'wrong_confirmation'
    client.emit('delete_account', {'password': 'ada_lovelace'})
    assert events(client, 'delete_account_result')[0]['success']
    assert query('SELECT * FROM oauth_accounts') == []
    # The GitHub account is free to start over (under a new name: the old one is retired)
    result = sign_in_with_github()
    assert 'signup' in result and result['username'] != 'ada_lovelace'


# ── linking from inside an account ────────────────────────────


def link(token):
    return lambda h: h.post('/api/auth/github/link', headers={'Authorization': f'Bearer {token}'})


def test_a_signed_in_user_can_connect_github_and_then_sign_in_with_it(provider_account):
    create_user('alice')
    _, token = login('alice')
    assert sign_in_with_github(start=link(token)) == {'linked': 'github'}
    result = sign_in_with_github()
    client = anon_client()
    client.emit('oauth_login', {'ticket': result['login']})
    assert events(client, 'oauth_login_result')[0]['username'] == 'alice'

    alice = connect_as('alice')
    alice.emit('get_sign_in_methods', {})
    assert events(alice, 'sign_in_methods')[0] == {
        'success': True,
        'has_password': True,
        'linked': ['github'],
        'available': ['github'],
    }


def test_one_github_account_links_to_one_reco_account(provider_account):
    create_user('alice')
    create_user('bob')
    _, alice_token = login('alice')
    _, bob_token = login('bob')
    assert sign_in_with_github(start=link(alice_token)) == {'linked': 'github'}
    assert sign_in_with_github(start=link(alice_token)) == {'error': 'oauth_same_account'}
    assert sign_in_with_github(start=link(bob_token)) == {'error': 'already_linked'}
    assert query('SELECT username FROM oauth_accounts') == [{'username': 'alice'}]


def test_linking_needs_a_real_session():
    http = app.test_client()
    assert http.post('/api/auth/github/link').status_code == 401
    guest = anon_client()
    guest.emit('guest_login', {})
    token = events(guest, 'guest_login_result')[0]['token']
    assert http.post('/api/auth/github/link', headers={'Authorization': f'Bearer {token}'}).status_code == 401


def test_the_last_way_to_sign_in_cannot_be_removed(provider_account):
    client, _ = register(sign_in_with_github())
    client.emit('oauth_unlink', {'provider': 'github'})
    assert events(client, 'oauth_unlink_result')[0]['code'] == 'last_sign_in_method'
    client.emit('change_password', {'old_password': '', 'new_password': 'mypassword'})
    token = events(client, 'change_password_result')[0]['token']
    client = socketio.test_client(app, auth={'token': token})
    client.emit('oauth_unlink', {'provider': 'github'})
    assert events(client, 'oauth_unlink_result')[0]['success']
    assert query('SELECT * FROM oauth_accounts') == []


def test_renaming_a_user_keeps_their_github_link(provider_account):
    from moderation import rename_user

    create_user('alice')
    _, token = login('alice')
    sign_in_with_github(start=link(token))
    assert rename_user('alice', 'alicia') is None
    client = anon_client()
    client.emit('oauth_login', {'ticket': sign_in_with_github()['login']})
    assert events(client, 'oauth_login_result')[0]['username'] == 'alicia'


def test_usernames_are_suggested_from_the_provider_name():
    from db import get_db

    with get_db() as conn:
        cur = conn.cursor()
        assert oauth.suggest_username(cur, 'Ada-Lovelace') == 'ada_lovelace'
        assert oauth.suggest_username(cur, 'Grace Hopper') == 'grace_hopper'
        assert oauth.suggest_username(cur, '李') == 'user'
        assert oauth.suggest_username(cur, 'x' * 40) == 'x' * 20

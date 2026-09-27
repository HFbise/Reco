"""Session tokens: issuing, resuming, rejecting and invalidating."""
from conftest import (
    socketio, app, create_user, events, anon_client, login, connect_as, query,
)
from auth_session import verify_token


def test_login_returns_token_and_binds_socket():
    create_user('alice')
    client, token = login('alice')
    assert verify_token(token) == 'alice'
    client.emit('get_rooms', {})
    assert events(client, 'rooms_list')  # authenticated immediately, no reconnect needed


def test_wrong_password_rejected():
    create_user('alice')
    client = anon_client()
    client.emit('login', {'username': 'alice', 'password': 'nope'})
    assert events(client, 'login_result')[0]['success'] is False


def test_unauthenticated_socket_cannot_call_protected_events():
    create_user('alice')
    client = anon_client()
    client.emit('get_rooms', {'username': 'alice'})  # claiming to be alice is not enough
    received = client.get_received()
    assert [e['name'] for e in received] == ['auth_required']


def test_token_resumes_session_on_new_connection():
    create_user('alice')
    _, token = login('alice')
    client = socketio.test_client(app, auth={'token': token})
    assert events(client, 'session_ready') == [{'username': 'alice'}]


def test_forged_token_is_rejected():
    create_user('alice')
    client = socketio.test_client(app, auth={'token': 'eyJ1IjoiYWxpY2UifQ.forged.signature'})
    assert events(client, 'session_expired') == [{}]
    client.emit('get_rooms', {})
    assert events(client, 'rooms_list') == []


def test_password_change_invalidates_old_tokens_but_returns_a_new_one():
    create_user('alice')
    client, old_token = login('alice')
    client.emit('change_password', {'old_password': 'secret123', 'new_password': 'newpass456'})
    result = events(client, 'change_password_result')[0]
    assert result['success']
    assert verify_token(old_token) is None
    assert verify_token(result['token']) == 'alice'


def test_change_password_ignores_claimed_username():
    create_user('alice')
    create_user('bob')
    client, _ = login('alice')
    # Alice knows her own password; tries to change Bob's by naming him
    client.emit('change_password', {'username': 'bob', 'old_password': 'secret123', 'new_password': 'hacked!!'})
    assert events(client, 'change_password_result')[0]['success']
    login('bob', 'secret123')  # Bob's password is untouched


def test_deleted_account_token_stops_working():
    create_user('alice')
    client, token = login('alice')
    client.emit('delete_account', {'password': 'secret123'})
    assert events(client, 'delete_account_result')[0]['success']
    assert verify_token(token) is None


def test_reset_password_is_rate_limited():
    create_user('alice', answer='blue')
    client = anon_client()
    for _ in range(10):
        client.emit('reset_password', {'username': 'alice', 'answer': 'guess', 'new_password': 'whatever1'})
    client.get_received()
    # Correct answer is now refused until the lockout expires
    client.emit('reset_password', {'username': 'alice', 'answer': 'blue', 'new_password': 'whatever1'})
    result = events(client, 'reset_password_result')[0]
    assert result['success'] is False and '尝试过多' in result['msg']


def test_security_answer_is_stored_hashed():
    client = anon_client()
    client.emit('register', {
        'username': 'carol', 'screenname': 'Carol', 'password': 'secret123',
        'security_question': 'Q?', 'security_answer': 'Paris',
    })
    assert events(client, 'register_result')[0]['success']
    stored = query('SELECT security_answer FROM users WHERE username = %s', 'carol')[0]['security_answer']
    assert stored.startswith('scrypt:') and 'paris' not in stored.lower()


def test_turn_credentials_only_for_logged_in_users():
    create_user('alice')
    _, token = login('alice')
    web = app.test_client()
    assert web.get('/api/ice-servers').get_json() == []
    assert web.get(f'/api/ice-servers?t={token}').get_json() == []  # token must not travel in the URL
    servers = web.get('/api/ice-servers', headers={'Authorization': f'Bearer {token}'}).get_json()
    turn = [s for s in servers if s['urls'].startswith('turn:')]
    assert len(turn) == 2 and all(s['username'].endswith(':alice') and s['credential'] for s in turn)

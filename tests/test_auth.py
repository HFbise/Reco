"""Session tokens: issuing, resuming, rejecting and invalidating."""

from conftest import (
    anon_client,
    app,
    connect_as,
    create_user,
    events,
    get_db,
    login,
    query,
    socketio,
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
    assert result['success'] is False and result['code'] == 'too_many_attempts'


def test_security_answer_is_stored_hashed():
    client = anon_client()
    client.emit(
        'register',
        {
            'username': 'carol',
            'screenname': 'Carol',
            'password': 'secret123',
            'security_question': 'birth_city',
            'security_answer': 'Paris',
        },
    )
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


def test_health_check_reports_database_status(monkeypatch):
    import app as app_module

    web = app.test_client()
    ok = web.get('/health')
    assert ok.status_code == 200 and ok.get_json()['database'] == 'ok'

    def db_down(*_a, **_k):
        raise OSError('connection refused')

    monkeypatch.setattr(app_module, 'get_db', db_down)
    down = web.get('/health')
    assert down.status_code == 503 and down.get_json()['database'] == 'unreachable'


def test_server_errors_are_not_leaked_to_the_client(monkeypatch, caplog):
    import handlers.auth

    create_user('alice')
    alice = connect_as('alice')

    def broken_db(*_a, **_k):
        raise RuntimeError('relation "users" does not exist at db-host.internal:5432')

    monkeypatch.setattr(handlers.auth, 'get_db', broken_db)
    alice.emit('update_profile', {'screenname': 'Alice', 'bio': ''})
    result = events(alice, 'update_profile_result')[0]
    assert result == {'success': False, 'code': 'server_error', 'params': {}}
    # ...but the details, with a traceback, are logged (and forwarded to Sentry in production)
    record = next(r for r in caplog.records if 'update_profile error' in r.getMessage())
    assert record.exc_info and 'db-host.internal' in record.getMessage()


def test_errors_are_codes_not_display_text():
    create_user('alice')
    client = anon_client()
    client.emit('login', {'username': 'alice', 'password': 'nope'})
    assert events(client, 'login_result') == [{'success': False, 'code': 'wrong_password', 'params': {}}]


def test_legacy_chinese_security_question_is_served_as_an_id():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO users (username, screenname, password, security_question, security_answer)'
            " VALUES ('old', 'Old', 'x', '你的出生城市是？', 'a')"
        )
        conn.commit()
    client = anon_client()
    client.emit('get_security_question', {'username': 'old'})
    assert events(client, 'security_question_result')[0]['question'] == 'birth_city'


def test_unknown_security_question_rejected_at_registration():
    client = anon_client()
    client.emit(
        'register',
        {
            'username': 'newbie',
            'screenname': 'N',
            'password': 'secret123',
            'security_question': 'anything I like',
            'security_answer': 'a',
        },
    )
    assert events(client, 'register_result')[0]['code'] == 'missing_fields'


def test_web_app_is_served_with_client_side_routing():
    web = app.test_client()
    home = web.get('/')
    assert home.status_code == 200 and b'<div id="root">' in home.data
    deep_link = web.get('/room/some-room')  # unknown path → the SPA handles it
    assert deep_link.status_code == 200 and deep_link.data == home.data
    assert web.get('/favicon.ico').status_code == 200  # real files from app/dist


def test_retired_service_worker_unregisters_itself():
    sw = app.test_client().get('/sw.js')
    assert sw.status_code == 200 and b'registration.unregister()' in sw.data

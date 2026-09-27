"""Account lifecycle: username rules, deletion, and what other users can learn."""

import pytest
from conftest import (
    anon_client,
    app,
    connect_as,
    create_user,
    events,
    get_db,
    query,
)


def register(username, screenname='Someone'):
    client = anon_client()
    client.emit(
        'register',
        {
            'username': username,
            'screenname': screenname,
            'password': 'secret123',
            'security_question': 'birth_city',
            'security_answer': 'a',
        },
    )
    return events(client, 'register_result')[0]


@pytest.mark.parametrize(
    'username',
    [
        'al',  # too short
        'a' * 21,  # too long
        'eve:bob',  # ':' would corrupt DM room ids like dm:eve:bob:alice
        "x'onload",  # quotes/HTML
        'white space',
        'system',  # reserved: author of system messages
        'admin',  # reserved: owns the lobby
    ],
)
def test_invalid_or_reserved_usernames_rejected(username):
    assert register(username)['success'] is False


def test_valid_username_accepted_and_lowercased():
    assert register('New_User_1')['success']
    assert query('SELECT username FROM users') == [{'username': 'new_user_1'}]


def test_empty_screenname_rejected():
    assert register('valid_name', screenname='   ')['success'] is False


def test_deleted_username_cannot_be_reclaimed_to_read_old_dms():
    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    alice.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    alice.emit('message', {'room': 'dm:alice:bob', 'text': 'private to bob'})

    bob.emit('delete_account', {'password': 'secret123'})
    assert events(bob, 'delete_account_result')[0]['success']

    # Someone else tries to register as "bob" to inherit the DM history
    assert register('bob')['success'] is False


def test_admin_panel_deletion_also_retires_the_name():
    create_user('bob')
    web = app.test_client()
    web.post('/admin/login', data={'password': 'test-admin'})
    web.post('/admin/users/bob/delete')
    assert query('SELECT username FROM deleted_usernames') == [{'username': 'bob'}]
    assert register('bob')['success'] is False


def test_new_room_is_not_announced_to_other_users():
    create_user('alice')
    create_user('bob')
    alice, bob = connect_as('alice'), connect_as('bob')
    alice.emit('create_room', {'room': 'secret club'})
    assert events(alice, 'new_room_created')  # creator's own sessions still get it
    assert events(bob, 'new_room_created') == []


def test_profile_limits_enforced():
    create_user('alice')
    alice = connect_as('alice')
    alice.emit('update_profile', {'screenname': '', 'bio': ''})
    assert events(alice, 'update_profile_result')[0]['success'] is False
    alice.emit('update_profile', {'screenname': 'Alice', 'bio': 'x' * 201})
    assert events(alice, 'update_profile_result')[0]['success'] is False


def test_admin_panel_does_not_execute_user_controlled_names():
    # Room names are free text; this one tries to break out of a JS string in onsubmit
    evil = "x')||alert(1)//"
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO rooms (name, owner, members) VALUES (%s, 'someone', '{}')", (evil,))
        conn.commit()
    web = app.test_client()
    web.post('/admin/login', data={'password': 'test-admin'})
    html = web.get('/admin/rooms').get_data(as_text=True)
    assert "x')||alert(1)" not in html  # the raw quote never reaches the page
    assert 'data-name="x&#39;)||alert(1)//"' in html  # carried as inert, escaped data

"""Opening a room, catching up after being away, and paging back through history."""

from conftest import connect_as, create_room, create_user, events, get_db, query

import history


def post(room, n, author='alice'):
    """n messages m0..m(n-1), each strictly newer than everything posted before."""
    with get_db() as conn:
        cur = conn.cursor()
        for i in range(n):
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, created_at)'
                " VALUES (%s, %s, 'A', %s, clock_timestamp())",
                (room, author, f'm{i}'),
            )
        conn.commit()


def open_room(client, room, since=None):
    client.emit('join', {'room': room, 'since': since})
    received = client.get_received()
    return [e['args'] for e in received if e['name'] == 'message'], [
        e for e in received if e['name'] == 'history_reset'
    ]


def test_opening_a_room_shows_the_latest_page_in_order():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    post('club', 70)
    messages, reset = open_room(connect_as('alice'), 'club')
    assert [m['text'] for m in messages] == [f'm{i}' for i in range(20, 70)]
    assert not reset


def test_catching_up_after_a_long_absence_resets_instead_of_leaving_a_gap():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    post('club', 5)
    last_seen = query("SELECT created_at FROM messages WHERE text = 'm4'")[0]['created_at'].isoformat()
    post('club', 80, author='bob')  # far more than a page arrives while away
    messages, reset = open_room(connect_as('alice'), 'club', since=last_seen)
    assert reset == [{'name': 'history_reset', 'args': [{'room': 'club'}], 'namespace': '/'}]
    assert len(messages) == history.PAGE_SIZE and messages[-1]['text'] == 'm79'  # the newest are shown


def test_short_absence_only_sends_what_is_new():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    post('club', 5)
    last_seen = query("SELECT created_at FROM messages WHERE text = 'm4'")[0]['created_at'].isoformat()
    post('club', 3, author='bob')
    messages, reset = open_room(connect_as('alice'), 'club', since=last_seen)
    assert [m['text'] for m in messages] == ['m0', 'm1', 'm2'] and not reset


def test_paging_back_through_history():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    post('club', 120)
    alice = connect_as('alice')
    first_page, _ = open_room(alice, 'club')
    alice.emit('load_older', {'room': 'club', 'before_id': first_page[0]['id']})
    page = events(alice, 'older_messages')[0]
    assert [m['text'] for m in page['messages']] == [f'm{i}' for i in range(20, 70)] and page['has_more']
    alice.emit('load_older', {'room': 'club', 'before_id': page['messages'][0]['id']})
    last = events(alice, 'older_messages')[0]
    assert [m['text'] for m in last['messages']] == [f'm{i}' for i in range(20)] and not last['has_more']


def test_cannot_page_through_a_room_you_have_not_joined():
    create_user('alice')
    create_user('mallory')
    create_room('secret', owner='alice', members=['alice'], password='pw')
    post('secret', 10)
    mallory = connect_as('mallory')
    mallory.emit('load_older', {'room': 'secret', 'before_id': 10**9})
    assert events(mallory, 'older_messages') == []


def test_join_reports_whether_older_history_exists():
    create_user('alice')
    create_room('small', owner='alice', members=['alice'])
    create_room('big', owner='alice', members=['alice'])
    post('small', 4)
    post('big', 60)
    alice = connect_as('alice')
    alice.emit('join', {'room': 'small'})
    assert events(alice, 'join_result')[0]['has_older'] is False
    alice.emit('join', {'room': 'big'})
    assert events(alice, 'join_result')[0]['has_older'] is True


def test_has_older_accounts_for_what_the_client_already_cached():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    post('club', 60)
    newest = query("SELECT id, created_at FROM messages WHERE text = 'm59'")[0]
    oldest_cached = query("SELECT id FROM messages WHERE text = 'm0'")[0]['id']
    alice = connect_as('alice')
    # Up to date, and the cache already reaches the very first message: nothing older
    alice.emit('join', {'room': 'club', 'since': newest['created_at'].isoformat(), 'oldest_id': oldest_cached})
    assert events(alice, 'join_result')[0]['has_older'] is False


def test_messages_carry_the_senders_avatar():
    create_user('alice')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET avatar_expression = 'Laugh', avatar_color = '#EB459E' WHERE username = 'alice'")
        conn.commit()
    create_room('club', owner='alice', members=['alice'])
    alice = connect_as('alice')
    alice.emit('join', {'room': 'club', 'skip_history': True})
    alice.get_received()
    alice.emit('message', {'room': 'club', 'text': 'hi'})
    live = [m for m in events(alice, 'message') if m['text'] == 'hi'][0]
    assert (live['avatar_expression'], live['avatar_color']) == ('Laugh', '#EB459E')
    history_msgs, _ = open_room(connect_as('alice'), 'club')
    assert history_msgs[-1]['avatar_color'] == '#EB459E'

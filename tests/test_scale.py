"""What keeps working as Reco grows: the DM list's query uses its indexes, and phone pushes go out
in batches Expo accepts, forgetting devices that are gone."""

import json

from conftest import connect_as, create_user, events, get_db, query

import handlers.push as push


def test_the_dm_list_reads_through_its_indexes():
    create_user('alice')
    with get_db() as conn:
        cur = conn.cursor()
        # Plenty of other people's DMs, and one of alice's
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text)'
            " SELECT 'dm:p' || (g % 50) || ':q', 'q', 'Q', 't' FROM generate_series(1, 5000) g"
        )
        cur.execute("INSERT INTO messages (room, username, screenname, text) VALUES ('dm:alice:p1', 'p1', 'P', 'hi')")
        cur.execute('ANALYZE messages')
        conn.commit()
        for part in (2, 3):
            cur.execute(
                f"EXPLAIN SELECT room FROM messages WHERE room LIKE 'dm:%%' AND split_part(room, ':', {part}) = %s",
                ('alice',),
            )
            plan = ' '.join(r['QUERY PLAN'] for r in cur.fetchall())
            assert f'messages_dm_part{part}_idx' in plan, plan
    create_user('p1')
    alice = connect_as('alice')
    alice.emit('get_dms', {})
    assert [d['dm_room'] for d in events(alice, 'dms_list')[0]['dms']] == ['dm:alice:p1']


class _Response:
    def __init__(self, tickets):
        self.body = json.dumps({'data': tickets}).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.body


def test_phone_pushes_go_out_in_batches_and_gone_devices_are_forgotten(monkeypatch):
    tokens = [f'ExponentPushToken[{i}]' for i in range(250)]
    with get_db() as conn:
        cur = conn.cursor()
        for t in tokens:
            cur.execute("INSERT INTO push_tokens (token, username, platform) VALUES (%s, 'alice', 'ios')", (t,))
        conn.commit()
    batches = []

    def urlopen(request, timeout):
        sent = json.loads(request.data)
        batches.append(len(sent))
        # Expo answers one ticket per message; say the first of each batch is uninstalled
        return _Response(
            [{'status': 'error', 'details': {'error': 'DeviceNotRegistered'}}]
            + [{'status': 'ok', 'id': 'x'}] * (len(sent) - 1)
        )

    class Now:  # run the worker at once instead of on a thread
        def __init__(self, target, daemon):
            self.target = target

        def start(self):
            self.target()

    monkeypatch.setattr(push._req, 'urlopen', urlopen)
    monkeypatch.setattr(push.threading, 'Thread', Now)
    push.send_push(tokens, 'Title', 'Body')
    assert batches == [100, 100, 50]
    left = {r['token'] for r in query('SELECT token FROM push_tokens')}
    assert left == set(tokens) - {tokens[0], tokens[100], tokens[200]}

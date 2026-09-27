"""The connection pool queues callers instead of failing when all connections are busy."""
import threading
import time

import pytest

import db


def test_exhausted_pool_waits_for_a_free_connection():
    held = [db.get_db() for _ in range(db.POOL_MAX)]
    got = {}

    def worker():
        with db.get_db(timeout=5) as conn:
            conn.cursor().execute('SELECT 1')
            got['ok'] = True

    t = threading.Thread(target=worker)
    t.start()
    time.sleep(0.3)
    assert 'ok' not in got          # still waiting, not crashed
    held.pop().close()              # free one connection
    t.join(5)
    assert got.get('ok')
    for c in held:
        c.close()


def test_gives_up_after_timeout():
    held = [db.get_db() for _ in range(db.POOL_MAX)]
    try:
        with pytest.raises(TimeoutError):
            db.get_db(timeout=0.2)
    finally:
        for c in held:
            c.close()


def test_closing_twice_does_not_leak_a_slot():
    conn = db.get_db()
    conn.close()
    conn.close()
    held = [db.get_db(timeout=1) for _ in range(db.POOL_MAX)]  # all slots still available
    for c in held:
        c.close()

import os
import threading

from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

POOL_MAX = int(os.environ.get('DB_POOL_MAX', '10'))

_pool = pg_pool.ThreadedConnectionPool(
    1,
    POOL_MAX,
    os.environ.get('DATABASE_URL'),
    cursor_factory=RealDictCursor,
    # Detect connections the server or a proxy dropped while idle
    keepalives=1,
    keepalives_idle=30,
    keepalives_interval=10,
    keepalives_count=3,
)
# psycopg2's pool raises PoolError when exhausted instead of waiting; with many
# handler threads (gunicorn --threads) a burst would fail. Make callers queue.
_slots = threading.BoundedSemaphore(POOL_MAX)


class _Conn:
    """Wraps a pooled connection so conn.close() returns it to the pool."""

    def __init__(self, conn):
        self._c = conn

    def __getattr__(self, name):
        return getattr(self._c, name)

    def close(self):
        if self._c is None:
            return
        try:
            if not self._c.closed:
                self._c.rollback()  # never hand back a connection mid-transaction
        except Exception:
            pass
        # A connection that died (server restart, dropped by a proxy) is discarded,
        # otherwise the next caller would get it and fail
        _pool.putconn(self._c, close=bool(self._c.closed))
        self._c = None
        _slots.release()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def get_db(timeout: float = 30) -> _Conn:
    if not _slots.acquire(timeout=timeout):
        raise TimeoutError('database connection pool exhausted')
    try:
        conn = _pool.getconn()
        if conn.closed:
            _pool.putconn(conn, close=True)
            conn = _pool.getconn()
        return _Conn(conn)
    except Exception:
        _slots.release()
        raise

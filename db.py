import os
import threading

from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

POOL_MAX = int(os.environ.get('DB_POOL_MAX', '10'))

_pool = pg_pool.ThreadedConnectionPool(
    1, POOL_MAX,
    os.environ.get('DATABASE_URL'),
    cursor_factory=RealDictCursor,
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
            if self._c.status != 0:
                self._c.rollback()
        except Exception:
            pass
        _pool.putconn(self._c)
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
        return _Conn(_pool.getconn())
    except Exception:
        _slots.release()
        raise

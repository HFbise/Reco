import os
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

_pool = pg_pool.ThreadedConnectionPool(
    2, 10,
    os.environ.get('DATABASE_URL'),
    cursor_factory=RealDictCursor,
)


class _Conn:
    """Wraps a pooled connection so conn.close() returns it to the pool."""
    def __init__(self, conn):
        self._c = conn

    def __getattr__(self, name):
        return getattr(self._c, name)

    def close(self):
        try:
            if self._c.status != 0:
                self._c.rollback()
        except Exception:
            pass
        _pool.putconn(self._c)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def get_db() -> _Conn:
    return _Conn(_pool.getconn())

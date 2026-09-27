"""Production entry point.

    gunicorn -w 1 --threads 100 --bind 0.0.0.0:$PORT wsgi:app

Exactly one worker: presence, voice rooms and rate limits live in process
memory, so a second worker would not see the first one's sockets. Threads give
concurrency (each WebSocket holds one thread while connected).
"""

from app import _migrate, app  # noqa: F401  (importing app registers every handler)

_migrate()

"""gunicorn settings, loaded automatically from the working directory.

Render's start command only needs `gunicorn wsgi:app`; flags given there still
override these.
"""

import os

bind = f'0.0.0.0:{os.environ.get("PORT", "5000")}'
# One worker: presence, voice rooms and rate limits live in process memory (see wsgi.py)
workers = 1
# Each WebSocket holds a thread while connected, so this caps how many people can be online
# at once (tests/load_gunicorn.py: with 100, the 101st couldn't connect)
threads = 200
# Startup runs database migrations (wsgi.py); on a small instance that can take a
# while, and the default 30s would kill the worker mid-boot in a restart loop.
timeout = 120

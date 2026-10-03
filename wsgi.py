"""Production entry point: the backend lives in server/, this file and gunicorn.conf.py stay
at the root because that's where Render runs the start command from.

    gunicorn wsgi:app        (settings in gunicorn.conf.py)

Exactly one worker: presence, voice rooms and rate limits live in process
memory, so a second worker would not see the first one's sockets. Threads give
concurrency (each WebSocket holds one thread while connected).
"""

# Load the IDNA codec before anything else. Werkzeug encodes the Host header with it
# on every request, and Python caches a failed codec lookup forever: on Render the
# first lookup failed and every request then raised "unknown encoding: idna".
# Importing it explicitly here fails loudly with the real reason instead.
import encodings.idna  # noqa: F401
import os
import sys

# server/ first: the root also holds app/ (the frontend), which `import app` must not find
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server'))

from app import _migrate, app  # noqa: F401  (importing app registers every handler)
from handlers.match import start_housekeeping

'reco.example'.encode('idna')  # prime the codec cache
_migrate()
start_housekeeping()  # hourly: expired match transcripts, photos nobody can see

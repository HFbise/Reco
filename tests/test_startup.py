"""The production entry point registers every Socket.IO handler on its own.

Other test modules import handler modules directly, which registers them as a
side effect, so an in-process check can't catch a missing `import handlers`.
Import the app in a clean interpreter instead.
"""

import os
import subprocess
import sys

SERVER = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server')

CHECK = """
import app
from extensions import socketio
events = set(socketio.server.handlers.get('/', {}))
missing = {'connect', 'login', 'message', 'join', 'get_rooms'} - events
assert not missing, f'handlers not registered: {missing}'
print(len(events))
"""


def test_importing_the_app_registers_socket_handlers():
    result = subprocess.run(
        [sys.executable, '-c', CHECK], cwd=SERVER, env=dict(os.environ), capture_output=True, text=True, timeout=120
    )
    assert result.returncode == 0, result.stderr[-2000:]
    assert int(result.stdout.strip().splitlines()[-1]) > 40

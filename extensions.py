import os
import logging
from flask import Flask
from flask_socketio import SocketIO

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
if not app.config['SECRET_KEY']:
    # Session tokens are signed with this key; a random one logs everyone out on restart.
    logging.getLogger(__name__).warning('SECRET_KEY not set, using a random key (sessions will not survive restarts)')
    app.config['SECRET_KEY'] = os.urandom(32).hex()
# Admin panel forms are cookie-authenticated: don't send the cookie on cross-site POSTs
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

_cors = os.environ.get('CORS_ORIGINS', '*')
socketio = SocketIO(
    app,
    async_mode='threading',
    cors_allowed_origins=_cors if _cors == '*' else _cors.split(','),
)

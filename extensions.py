import os
from flask import Flask
from flask_socketio import SocketIO

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(32).hex())

_cors = os.environ.get('CORS_ORIGINS', '*')
socketio = SocketIO(
    app,
    async_mode='threading',
    cors_allowed_origins=_cors if _cors == '*' else _cors.split(','),
)

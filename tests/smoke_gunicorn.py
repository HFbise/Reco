"""End-to-end smoke test of the production server (gunicorn + WebSocket transport).

Run by CI on Linux (gunicorn does not run on Windows):
    DATABASE_URL=... python tests/smoke_gunicorn.py
"""
import os
import socket
import subprocess
import sys
import time

import socketio

PORT = 5099
URL = f'http://127.0.0.1:{PORT}'


def wait_for_port(timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            socket.create_connection(('127.0.0.1', PORT), timeout=1).close()
            return
        except OSError:
            time.sleep(0.3)
    raise SystemExit('gunicorn did not start')


def call(client, event, data, reply):
    """Emit `event` and wait for the `reply` event's payload."""
    box = {}
    client.on(reply, lambda d: box.setdefault('d', d))
    client.emit(event, data)
    deadline = time.time() + 10
    while 'd' not in box and time.time() < deadline:
        time.sleep(0.05)
    if 'd' not in box:
        raise SystemExit(f'no {reply} after {event}')
    return box['d']


def main():
    env = dict(os.environ, SECRET_KEY='smoke', PORT=str(PORT))
    server = subprocess.Popen(
        [sys.executable, '-m', 'gunicorn', '-w', '1', '--threads', '20', '--bind', f'127.0.0.1:{PORT}', 'wsgi:app'],
        env=env,
    )
    try:
        wait_for_port()

        anon = socketio.Client()
        anon.connect(URL, transports=['websocket'])
        assert call(anon, 'register', {
            'username': 'smoke_user', 'screenname': 'Smoke', 'password': 'secret123',
            'security_question': 'Q?', 'security_answer': 'a',
        }, 'register_result')['success']
        login = call(anon, 'login', {'username': 'smoke_user', 'password': 'secret123'}, 'login_result')
        assert login['success'] and login['token']
        anon.disconnect()

        # A new connection authenticated only by the handshake token
        user = socketio.Client()
        ready = {}
        user.on('session_ready', lambda d: ready.setdefault('u', d['username']))
        user.connect(URL, transports=['websocket'], auth={'token': login['token']})
        assert call(user, 'join', {'room': '大厅', 'skip_history': True}, 'join_result')['success']
        assert ready.get('u') == 'smoke_user'
        received = []
        user.on('message', received.append)
        user.emit('message', {'room': '大厅', 'text': 'hello from gunicorn', 'username': 'spoofed'})
        deadline = time.time() + 10
        while not any(m.get('text') == 'hello from gunicorn' for m in received) and time.time() < deadline:
            time.sleep(0.05)
        ours = [m for m in received if m.get('text') == 'hello from gunicorn']
        assert ours and ours[0]['username'] == 'smoke_user', received
        user.disconnect()
        print('gunicorn smoke test passed')
    finally:
        server.terminate()
        server.wait(timeout=10)


if __name__ == '__main__':
    main()

"""Load test of the production server setup (gunicorn + WebSocket), run by .github/workflows/load.yml.

    DATABASE_URL=... python tests/load_gunicorn.py

It starts gunicorn the way Render does (gunicorn.conf.py: one worker, LOAD_THREADS threads), then
adds signed-in users in stages, all in one room. At each stage it measures:
- connecting: how many of the new users get connected and into the room, and how long it takes;
- a burst of messages: a few users send at once, and every user in the room should receive every
  message. Latency is from sending to arriving at each receiver (fan-out);
- the send acknowledgement (the server stored and broadcast it) and a ping round trip.
It stops raising the load once users fail to connect or messages stop arriving.

The users all run in this one process on asyncio, so the clients aren't the bottleneck; but they
share the machine with the server, so the numbers describe this machine, not Render's.
"""

import asyncio
import os
import random
import socket
import subprocess
import sys
import time

PORT = 5098
URL = f'http://127.0.0.1:{PORT}'
ROOM = 'load'
STAGES = [int(n) for n in os.environ.get('LOAD_STAGES', '25,50,75,100,125,150,200,300,400').split(',')]
THREADS = [int(n) for n in os.environ.get('LOAD_THREADS', '100').split(',')]
SENDERS = 5
MESSAGES_EACH = 4  # the server allows 8 per 10 s per person
WAIT = 15  # seconds for a message burst to arrive everywhere

os.environ.setdefault('SECRET_KEY', 'load')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2  # noqa: E402
import socketio  # noqa: E402


def wait_for_port(timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            socket.create_connection(('127.0.0.1', PORT), timeout=1).close()
            return
        except OSError:
            time.sleep(0.3)
    raise SystemExit('gunicorn did not start')


def start_server(threads: int):
    env = dict(os.environ, PORT=str(PORT))
    # gunicorn.conf.py sets the rest (one worker, the 120 s timeout), as on Render
    proc = subprocess.Popen([sys.executable, '-m', 'gunicorn', '--threads', str(threads), 'wsgi:app'], env=env)
    wait_for_port()
    return proc


def seed(count: int) -> dict[str, str]:
    """`count` users in one room, and a session token for each."""
    from auth_session import make_token  # needs the schema the server just created
    from utils import hash_password

    hashed = hash_password('secret123')
    names = [f'load{i:04d}' for i in range(count)]
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE username LIKE 'load%%'")
    for name in names:
        cur.execute(
            'INSERT INTO users (username, screenname, password, bio, security_question, security_answer)'
            " VALUES (%s, %s, %s, '', 'Q?', %s)",
            (name, name, hashed, hashed),
        )
    cur.execute('DELETE FROM rooms WHERE name = %s', (ROOM,))
    cur.execute(
        "INSERT INTO rooms (name, owner, members, admins, code) VALUES (%s, %s, %s, '{}', '424242')",
        (ROOM, names[0], names),
    )
    conn.commit()
    conn.close()
    return {name: make_token(name, hashed) for name in names}


def clear_messages():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.cursor().execute('DELETE FROM messages WHERE room = %s', (ROOM,))
    conn.commit()
    conn.close()


class User:
    def __init__(self, name: str, token: str):
        self.name, self.token = name, token
        self.sio = socketio.AsyncClient(reconnection=False)
        self.arrived: dict[str, float] = {}
        self.joined = asyncio.Event()
        self.pong = asyncio.Event()

        @self.sio.on('message')
        async def on_message(data):
            if str(data.get('text', '')).startswith('load-'):
                self.arrived[data['text']] = time.perf_counter()

        @self.sio.on('join_result')
        async def on_join(data):
            if data.get('success'):
                self.joined.set()

        @self.sio.on('pong_check')
        async def on_pong(_data):
            self.pong.set()

    async def start(self) -> float:
        began = time.perf_counter()
        await self.sio.connect(URL, transports=['websocket'], auth={'token': self.token}, wait_timeout=20)
        await self.sio.emit('join', {'room': ROOM, 'skip_history': True})
        await asyncio.wait_for(self.joined.wait(), 20)
        return time.perf_counter() - began

    async def ping(self) -> float:
        self.pong.clear()
        began = time.perf_counter()
        await self.sio.emit('ping_check', {'t': 0})
        await asyncio.wait_for(self.pong.wait(), 10)
        return time.perf_counter() - began

    async def send(self, text: str) -> tuple[float, float]:
        began = time.perf_counter()
        reply = await self.sio.call('message', {'room': ROOM, 'text': text, 'client_id': text}, timeout=15)
        if not reply or not reply.get('ok'):
            raise RuntimeError(f'send refused: {reply}')
        return began, time.perf_counter() - began


def pct(values, p):
    if not values:
        return float('nan')
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(p / 100 * (len(ordered) - 1))))]


def ms(seconds):
    return f'{seconds * 1000:.0f}'


async def run(threads: int, tokens: dict[str, str]) -> list[dict]:
    users: list[User] = []
    rows = []
    names = list(tokens)
    for stage in STAGES:
        if stage > len(names):
            break
        new = [User(n, tokens[n]) for n in names[len(users) : stage]]
        results = await asyncio.gather(*(u.start() for u in new), return_exceptions=True)
        connected = [(u, r) for u, r in zip(new, results, strict=True) if not isinstance(r, BaseException)]
        failed = len(new) - len(connected)
        users.extend(u for u, _ in connected)
        await asyncio.sleep(1)

        # A burst: SENDERS people send MESSAGES_EACH messages at once
        # (different people each stage: the server allows 8 messages per 10 s per person)
        first = (len(rows) * SENDERS) % len(users)
        senders = (users[first:] + users[:first])[:SENDERS]
        texts = [f'load-{threads}-{stage}-{i}-{k}' for i in range(len(senders)) for k in range(MESSAGES_EACH)]
        jobs = [
            senders[i].send(f'load-{threads}-{stage}-{i}-{k}')
            for i in range(len(senders))
            for k in range(MESSAGES_EACH)
        ]
        sent = await asyncio.gather(*jobs, return_exceptions=True)
        sent_at = {t: s[0] for t, s in zip(texts, sent, strict=True) if not isinstance(s, BaseException)}
        acks = [s[1] for s in sent if not isinstance(s, BaseException)]
        deadline = time.perf_counter() + WAIT
        expected = len(sent_at) * len(users)
        while time.perf_counter() < deadline:
            if sum(len(u.arrived.keys() & sent_at.keys()) for u in users) >= expected:
                break
            await asyncio.sleep(0.2)
        latencies = [u.arrived[t] - sent_at[t] for u in users for t in sent_at if t in u.arrived]
        pings = await asyncio.gather(
            *(u.ping() for u in random.sample(users, min(20, len(users)))), return_exceptions=True
        )
        pings = [p for p in pings if not isinstance(p, BaseException)]

        row = {
            'threads': threads,
            'users': len(users),
            'connect_failed': failed,
            'connect_p95': pct([r for _, r in connected], 95),
            'sent': f'{len(sent_at)}/{len(texts)}',
            'delivered': len(latencies) / expected if expected else 0.0,
            'fanout_p50': pct(latencies, 50),
            'fanout_p95': pct(latencies, 95),
            'fanout_max': max(latencies) if latencies else float('nan'),
            'ack_p95': pct(acks, 95),
            'ping_p95': pct(pings, 95),
        }
        rows.append(row)
        print(
            f'threads={threads} users={row["users"]} connect_failed={failed} connect_p95={ms(row["connect_p95"])}ms'
            f' sent={row["sent"]} delivered={row["delivered"]:.1%} fanout p50/p95/max='
            f'{ms(row["fanout_p50"])}/{ms(row["fanout_p95"])}/{ms(row["fanout_max"])}ms'
            f' ack_p95={ms(row["ack_p95"])}ms ping_p95={ms(row["ping_p95"])}ms',
            flush=True,
        )
        if failed > len(new) * 0.1 or row['delivered'] < 0.95:
            print(f'threads={threads}: stopping, the server no longer keeps up', flush=True)
            break
    await asyncio.gather(*(u.sio.disconnect() for u in users), return_exceptions=True)
    return rows


def report(rows: list[dict]):
    head = (
        '| threads | users online | failed to connect | connect p95 | messages sent | delivered'
        ' | fan-out p50 | fan-out p95 | fan-out max | send ack p95 | ping p95 |\n'
        '|---|---|---|---|---|---|---|---|---|---|---|\n'
    )
    body = ''.join(
        f'| {r["threads"]} | {r["users"]} | {r["connect_failed"]} | {ms(r["connect_p95"])} ms | {r["sent"]}'
        f' | {r["delivered"]:.1%} | {ms(r["fanout_p50"])} ms | {ms(r["fanout_p95"])} ms | {ms(r["fanout_max"])} ms'
        f' | {ms(r["ack_p95"])} ms | {ms(r["ping_p95"])} ms |\n'
        for r in rows
    )
    machine = f'{os.cpu_count()} CPUs; server and clients on the same machine'
    text = f'## Load test\n\n{machine}. Stages: {STAGES}.\n\n{head}{body}'
    print(text)
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write(text)


def main():
    rows = []
    tokens = None
    for threads in THREADS:
        server = start_server(threads)
        try:
            if tokens is None:
                tokens = seed(max(STAGES))
            clear_messages()
            rows += asyncio.run(run(threads, tokens))
        finally:
            server.terminate()
            server.wait(timeout=30)
            time.sleep(2)
    report(rows)


if __name__ == '__main__':
    main()

"""Random matching over Socket.IO (pairing rules live in matching.py).

Privacy model: the two people in a match are anonymous to each other. The
server relays every message and voice signal to the partner's socket itself,
tagged only as "me" / "stranger"; usernames never leave the server unless
BOTH sides press "keep in touch", which reveals them and opens a normal DM.
Match messages are stored for 7 days (evidence for reports) and then deleted.
"""

import logging
import random
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from flask import request
from flask_socketio import emit

import moderation
from auth_session import authenticated
from db import get_db
from extensions import socketio
from matching import MODES, MatchQueue, Ticket, normalize_tags
from replies import fail
from state import check_msg_rate, emit_system_msg

log = logging.getLogger(__name__)

MAX_MESSAGE_LEN = 2000
RETENTION_DAYS = 7
SWEEP_EVERY = 2  # seconds
PURGE_EVERY = 3600  # seconds

# The stranger's face: random per match, never the partner's real avatar
EXPRESSIONS = ['Smile', 'Laugh', 'BigLaugh', 'Angi', 'Sad', 'Em']
COLORS = ['#5865F2', '#3BA55C', '#FAA61A', '#ED4245', '#EB459E', '#57F287', '#0099E1', '#9C84EC']


def _blocked(a: str, b: str) -> bool:
    with get_db() as conn:
        return moderation.blocked_either_way(conn.cursor(), a, b)


queue = MatchQueue(blocked=_blocked)


@dataclass
class Side:
    match_id: int
    mode: str
    sid: str
    partner: str
    partner_sid: str
    tags: frozenset
    is_a: bool


_live: dict[str, Side] = {}  # username -> their side of an active match
_last_partner: dict[str, str] = {}  # avoid pairing someone straight back with who they just left
_live_lock = threading.Lock()
_loop_started = False


def _ensure_background_loop():
    """Pair people who became matchable by waiting, and purge expired transcripts."""
    global _loop_started
    if _loop_started:
        return
    _loop_started = True

    def loop():
        last_purge = 0.0
        while True:
            socketio.sleep(SWEEP_EVERY)
            try:
                for a, b in queue.sweep():
                    _start(a, b)
                if time.monotonic() - last_purge > PURGE_EVERY:
                    purge_expired()
                    last_purge = time.monotonic()
            except Exception as e:
                log.exception('match loop error: %s', e)

    socketio.start_background_task(loop)


def purge_expired():
    """Delete match transcripts (and the match records) older than RETENTION_DAYS."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM messages WHERE room LIKE 'match:%%' AND created_at < NOW() - make_interval(days => %s)",
            (RETENTION_DAYS,),
        )
        cur.execute('DELETE FROM matches WHERE started_at < NOW() - make_interval(days => %s)', (RETENTION_DAYS,))
        conn.commit()


def _start(a: Ticket, b: Ticket):
    shared = sorted(a.tags & b.tags)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO matches (mode, user_a, user_b, tags) VALUES (%s, %s, %s, %s) RETURNING id',
            (a.mode, a.username, b.username, shared),
        )
        match_id = cur.fetchone()['id']
        conn.commit()
    with _live_lock:
        _live[a.username] = Side(match_id, a.mode, a.sid, b.username, b.sid, frozenset(shared), True)
        _live[b.username] = Side(match_id, b.mode, b.sid, a.username, a.sid, frozenset(shared), False)
    for ticket, initiator in ((a, True), (b, False)):
        # Each side gets a random face for the other, independent of who they really are
        rng = random.Random(f'{match_id}:{ticket.username}')
        socketio.emit(
            'match_found',
            {
                'match_id': match_id,
                'mode': ticket.mode,
                'shared_tags': shared,
                'stranger': {'expression': rng.choice(EXPRESSIONS), 'color': rng.choice(COLORS)},
                # voice: exactly one side makes the WebRTC offer
                'initiator': initiator,
            },
            to=ticket.sid,
        )


def _end(username: str, reason: str):
    """End `username`'s current match; the partner is told the stranger left."""
    with _live_lock:
        side = _live.pop(username, None)
        if side:
            _live.pop(side.partner, None)
    if not side:
        return None
    _last_partner[username] = side.partner
    _last_partner[side.partner] = username
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'UPDATE matches SET ended_at = NOW(), ended_by = %s, end_reason = %s WHERE id = %s AND ended_at IS NULL',
                (username, reason, side.match_id),
            )
            conn.commit()
    except Exception as e:
        log.exception('end match error: %s', e)
    socketio.emit('match_ended', {'match_id': side.match_id, 'reason': 'partner_left'}, to=side.partner_sid)
    return side


def _mine(username: str) -> Side | None:
    """The caller's live match, only from the socket that joined it."""
    side = _live.get(username)
    return side if side and side.sid == request.sid else None


def on_disconnect(username: str | None, sid: str):
    if not username:
        return
    queue.leave(username, sid=sid)  # only if this socket is the one waiting
    side = _live.get(username)
    if side and side.sid == sid:
        _end(username, 'disconnected')


def _enqueue(username: str, mode: str, tags: list[str]):
    _ensure_background_loop()
    ticket = Ticket(
        username=username, sid=request.sid, mode=mode, tags=frozenset(tags), last_partner=_last_partner.get(username)
    )
    partner = queue.join(ticket)
    if partner:
        _start(partner, ticket)
    else:
        emit('match_waiting', {'mode': mode, 'tags': tags})


# ── events ────────────────────────────────────────────────────


@socketio.on('match_enqueue')
@authenticated
def handle_match_enqueue(username, data):
    mode = data.get('mode')
    if mode not in MODES:
        fail('match_error', 'invalid_mode')
        return
    if username in _live:
        _end(username, 'next')
    _enqueue(username, mode, normalize_tags(data.get('tags')))


@socketio.on('match_cancel')
@authenticated
def handle_match_cancel(username, data):
    queue.leave(username)
    emit('match_cancelled', {})


@socketio.on('match_next')
@authenticated
def handle_match_next(username, data):
    side = _mine(username)
    mode = side.mode if side else data.get('mode')
    if side:
        _end(username, 'next')
    if mode in MODES:
        _enqueue(username, mode, normalize_tags(data.get('tags')))


@socketio.on('match_leave')
@authenticated
def handle_match_leave(username, data):
    if _mine(username):
        _end(username, 'left')
    emit('match_ended', {'reason': 'you_left'})


@socketio.on('match_message')
@authenticated
def handle_match_message(username, data):
    side = _mine(username)
    text = (data.get('text') or '').strip()[:MAX_MESSAGE_LEN]
    if not side or not text:
        return
    if not check_msg_rate(username):
        emit('message_rate_limited', {})
        return
    room = f'match:{side.match_id}'
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT screenname FROM users WHERE username = %s', (username,))
            row = cur.fetchone()
            # Stored with real identity (for reports); never sent to the partner
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, time) VALUES (%s, %s, %s, %s, %s) RETURNING id',
                (room, username, row['screenname'] if row else username, text, datetime.now().strftime('%H:%M')),
            )
            msg_id = cur.fetchone()['id']
            conn.commit()
    except Exception as e:
        log.exception('match_message error: %s', e)
        return
    base = {'id': msg_id, 'text': text, 'time': datetime.now(UTC).isoformat()}
    emit('match_message', {**base, 'from': 'me'})
    socketio.emit('match_message', {**base, 'from': 'stranger'}, to=side.partner_sid)


@socketio.on('match_typing')
@authenticated
def handle_match_typing(username, data):
    side = _mine(username)
    if side:
        socketio.emit('match_typing', {}, to=side.partner_sid)


@socketio.on('match_signal')
@authenticated
def handle_match_signal(username, data):
    """WebRTC offer / answer / ICE for voice matches, relayed to the partner only."""
    side = _mine(username)
    if not side or side.mode != 'voice' or data.get('type') not in ('offer', 'answer', 'ice'):
        return
    socketio.emit('match_signal', {'type': data['type'], 'payload': data.get('payload')}, to=side.partner_sid)


@socketio.on('match_keep')
@authenticated
def handle_match_keep(username, data):
    """Wants to keep in touch. Only when both sides agree are identities revealed."""
    side = _mine(username)
    if not side:
        return
    column = 'a_keeps' if side.is_a else 'b_keeps'
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            f'UPDATE matches SET {column} = TRUE WHERE id = %s RETURNING a_keeps, b_keeps, user_a, user_b',
            (side.match_id,),
        )
        row = cur.fetchone()
        conn.commit()
    emit('match_keep_ack', {})
    if not (row and row['a_keeps'] and row['b_keeps']):
        return  # the other side is never told about a one-sided request
    dm_room = moderation.dm_room_id(row['user_a'], row['user_b'])
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('UPDATE matches SET dm_room = %s WHERE id = %s', (dm_room, side.match_id))
        cur.execute(
            'SELECT username, screenname, avatar_expression, avatar_color FROM users WHERE username = ANY(%s)',
            ([row['user_a'], row['user_b']],),
        )
        people = {r['username']: r for r in cur.fetchall()}
        conn.commit()
    # A first message makes the DM show up in both users' lists
    emit_system_msg(dm_room, 'match_connected')
    for other, sid in ((side.partner, side.sid), (username, side.partner_sid)):
        p = people.get(other, {})
        socketio.emit(
            'match_revealed',
            {
                'dm_room': dm_room,
                'username': other,
                'screenname': p.get('screenname', other),
                'avatar_expression': p.get('avatar_expression') or 'Smile',
                'avatar_color': p.get('avatar_color') or '#5865F2',
            },
            to=sid,
        )


@socketio.on('match_report')
@authenticated
def handle_match_report(username, data):
    """Report the stranger: recorded with the transcript, blocked from now on, match ended."""
    side = _mine(username)
    if not side:
        return
    reason = (data.get('reason') or '').strip()[:500]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO reports (reporter, reported, reason, match_id) VALUES (%s, %s, %s, %s)',
            (username, side.partner, reason, side.match_id),
        )
        cur.execute(
            'INSERT INTO blocks (blocker, blocked) VALUES (%s, %s) ON CONFLICT DO NOTHING', (username, side.partner)
        )
        conn.commit()
    _end(username, 'reported')
    emit('match_ended', {'reason': 'reported'})

"""TURN relay usage, reported by the coturn host (deploy/turn/reco_turn_report.py) and shown on
the admin panel's TURN page.

The host posts every minute, signed with HMAC-SHA256 of the body under TURN_SECRET (the secret
it already shares with this server for credentials). A post carries the sessions that changed,
with running totals, and per-day counts of STUN probes; storing keeps the larger of old and new
totals, so a post that arrives twice changes nothing.
"""

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import UTC, datetime, timedelta

from flask import Blueprint, jsonify, request

from db import get_db

log = logging.getLogger(__name__)

bp = Blueprint('turn_usage', __name__)

MAX_SKEW = 600  # seconds a post may be old (or early): an old copy can't be replayed later
MAX_BODY = 1_000_000
LIVE = 660  # a session not ended, heard from this recently, is still relaying (refreshes every ~5 min)


def migrate(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS turn_sessions (
            server_start BIGINT NOT NULL,
            session TEXT NOT NULL,
            username TEXT NOT NULL,
            started_at TIMESTAMPTZ NOT NULL,
            last_seen TIMESTAMPTZ NOT NULL,
            ended_at TIMESTAMPTZ,
            client_bytes BIGINT NOT NULL DEFAULT 0,
            relay_bytes BIGINT NOT NULL DEFAULT 0,
            reason TEXT,
            PRIMARY KEY (server_start, session)
        )
    """)
    cur.execute('CREATE INDEX IF NOT EXISTS turn_sessions_started ON turn_sessions (started_at)')
    cur.execute("""
        CREATE TABLE IF NOT EXISTS turn_daily (
            day DATE PRIMARY KEY,
            stun_requests BIGINT NOT NULL DEFAULT 0,
            reported_at TIMESTAMPTZ
        )
    """)


# ── the host's reports ────────────────────────────────────────


def _signed(body: bytes) -> bool:
    secret = os.environ.get('TURN_SECRET', '')
    if not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(request.headers.get('X-Reco-Signature', ''), expected)


def _number(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0 else None


def _stamp(t: float) -> datetime:
    return datetime.fromtimestamp(t, UTC)


def _session_row(s) -> tuple | None:
    """A reported session as a row to store, or None if it isn't one."""
    if not isinstance(s, dict):
        return None
    start, began, seen = _number(s.get('server_start')), _number(s.get('started_at')), _number(s.get('last_seen'))
    session, username = s.get('session'), s.get('username')
    if None in (start, began, seen) or not isinstance(session, str) or not isinstance(username, str):
        return None
    if not session or len(session) > 32 or not username:
        return None
    ended = _number(s.get('ended_at'))
    reason = s.get('reason') if isinstance(s.get('reason'), str) else None
    return (
        int(start),
        session,
        username[:40],
        _stamp(began),
        _stamp(seen),
        _stamp(ended) if ended is not None else None,
        int(_number(s.get('client_bytes')) or 0),
        int(_number(s.get('relay_bytes')) or 0),
        reason[:120] if reason else None,
    )


def record(cur, data: dict) -> int:
    """Store one report; how many sessions it held."""
    rows = [r for r in map(_session_row, data.get('sessions') or []) if r]
    for row in rows:
        cur.execute(
            'INSERT INTO turn_sessions (server_start, session, username, started_at, last_seen, ended_at,'
            ' client_bytes, relay_bytes, reason) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'
            ' ON CONFLICT (server_start, session) DO UPDATE SET'
            ' started_at = LEAST(turn_sessions.started_at, EXCLUDED.started_at),'
            ' last_seen = GREATEST(turn_sessions.last_seen, EXCLUDED.last_seen),'
            ' ended_at = COALESCE(EXCLUDED.ended_at, turn_sessions.ended_at),'
            ' client_bytes = GREATEST(turn_sessions.client_bytes, EXCLUDED.client_bytes),'
            ' relay_bytes = GREATEST(turn_sessions.relay_bytes, EXCLUDED.relay_bytes),'
            ' reason = COALESCE(EXCLUDED.reason, turn_sessions.reason)',
            row,
        )
    stun = data.get('stun') if isinstance(data.get('stun'), dict) else {}
    today = datetime.now(UTC).date()
    days = {today: 0}
    for day, count in stun.items():
        try:
            when = datetime.strptime(day, '%Y-%m-%d').date()
        except (TypeError, ValueError):
            continue
        if _number(count) is not None and abs((when - today).days) <= 7:
            days[when] = int(count)
    for when, count in days.items():
        cur.execute(
            'INSERT INTO turn_daily (day, stun_requests, reported_at) VALUES (%s, %s, NOW())'
            ' ON CONFLICT (day) DO UPDATE SET stun_requests = GREATEST(turn_daily.stun_requests, EXCLUDED.stun_requests),'
            ' reported_at = NOW()',
            (when, count),
        )
    return len(rows)


@bp.route('/api/turn/report', methods=['POST'])
def report():
    if (request.content_length or 0) > MAX_BODY:
        return jsonify(error='too_large'), 413
    body = request.get_data(cache=False)
    if not _signed(body):
        return jsonify(error='forbidden'), 403
    try:
        data = json.loads(body)
    except ValueError:
        return jsonify(error='bad_request'), 400
    sent_at = _number(data.get('sent_at')) if isinstance(data, dict) else None
    if sent_at is None or abs(time.time() - sent_at) > MAX_SKEW:
        return jsonify(error='stale'), 403
    try:
        with get_db() as conn:
            stored = record(conn.cursor(), data)
            conn.commit()
    except Exception as e:
        log.exception('turn report error: %s', e)
        return jsonify(error='server_error'), 500
    return jsonify(ok=True, sessions=stored)


# ── for the admin page ────────────────────────────────────────


def _peak(intervals, start: datetime, end: datetime) -> int:
    """The most of `intervals` ([(begin, finish)]) overlapping at once within [start, end)."""
    edges = []
    for begin, finish in intervals:
        begin, finish = max(begin, start), min(finish, end)
        if begin < finish:
            edges += [(begin, 1), (finish, -1)]
    best = now = 0
    for _, step in sorted(edges, key=lambda e: (e[0], e[1])):  # ends before starts at the same moment
        now += step
        best = max(best, now)
    return best


def overview(cur, days: int = 30) -> dict:
    """Now, the last 7 days, and a row per day (newest first, UTC) for the last `days`."""
    now = datetime.now(UTC)
    today = now.date()
    first = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), UTC)
    cur.execute(
        'SELECT username, started_at, COALESCE(ended_at, last_seen) AS finished, client_bytes, relay_bytes'
        ' FROM turn_sessions WHERE COALESCE(ended_at, last_seen) >= %s',
        (first,),
    )
    sessions = cur.fetchall()
    cur.execute('SELECT day, stun_requests FROM turn_daily WHERE day >= %s', (first.date(),))
    stun = {r['day']: r['stun_requests'] for r in cur.fetchall()}
    cur.execute('SELECT MAX(reported_at) AS t FROM turn_daily')
    reported = cur.fetchone()['t']
    cur.execute('SELECT COUNT(*) AS n FROM turn_sessions WHERE ended_at IS NULL AND last_seen > %s',
                (now - timedelta(seconds=LIVE),))  # fmt: skip
    live = cur.fetchone()['n']

    rows = []
    for back in range(days):
        day = today - timedelta(days=back)
        start = datetime.combine(day, datetime.min.time(), UTC)
        end = start + timedelta(days=1)
        begun = [s for s in sessions if start <= s['started_at'] < end]
        rows.append({
            'day': day,
            'sessions': len(begun),
            'users': len({s['username'] for s in begun}),
            'peak': _peak([(s['started_at'], s['finished']) for s in sessions], start, end),
            'relay_bytes': sum(s['relay_bytes'] for s in begun),
            'client_bytes': sum(s['client_bytes'] for s in begun),
            'stun': stun.get(day, 0),
        })  # fmt: skip
    week = [s for s in sessions if s['started_at'] >= now - timedelta(days=7)]
    return {
        'live': live,
        'reported_at': reported,
        'silent_minutes': int((now - reported).total_seconds() // 60) if reported else None,
        'week_sessions': len(week),
        'week_users': len({s['username'] for s in week}),
        'week_relay_bytes': sum(s['relay_bytes'] for s in week),
        'peak': max((r['peak'] for r in rows), default=0),
        'days': rows,
    }


def recent(cur, limit: int, offset: int) -> tuple[list, int]:
    """Sessions, newest first, and how many there are in all."""
    cur.execute('SELECT COUNT(*) AS n FROM turn_sessions')
    total = cur.fetchone()['n']
    cur.execute(
        'SELECT username, started_at, ended_at, last_seen, client_bytes, relay_bytes, reason FROM turn_sessions'
        ' ORDER BY started_at DESC LIMIT %s OFFSET %s',
        (limit, offset),
    )
    return cur.fetchall(), total

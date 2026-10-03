#!/usr/bin/env python3
"""TURN usage for the Reco admin panel: runs on the coturn host every minute (cron, as root).

coturn (4.5.1, `verbose`) writes every request to its log, mostly STUN binding probes from the
internet: hundreds of MB a day. This reads what's new, keeps only what describes relayed calls
(sessions that signed in with a Reco credential: start, refreshes, traffic, end) plus a count of
STUN probes per day, then empties the log. What it keeps is posted to Reco's
/api/turn/report, signed with the TURN shared secret both sides already have; until a post
succeeds it stays in the state file and is sent again.

A Reco credential's username is "<expiry>:<reco username>". coturn counts traffic in chunks
("usage" every 1024 packets and at the end; "peer usage" is what was relayed to the other side),
so each session's totals add those up, and the server keeps the larger of what it has and what
it's sent: a repeated post can't count twice. Times in the log are seconds since coturn
started; the start comes from /proc.

Standard library only (the host has Python 3.8).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sys
import time
import urllib.request

LOG = '/var/log/turnserver/turn.log'
CONF = '/etc/turnserver.conf'
PIDFILE = '/run/turnserver/turnserver.pid'
STATE_DIR = '/var/lib/reco-turn'
URL = os.environ.get('RECO_TURN_REPORT_URL', 'https://chat-5wg8.onrender.com/api/turn/report')

STALE = 86400  # a session not heard from in a day is dropped (coturn restarted, say)
STUN_DAYS = 3  # per-day STUN counts kept (and resent) this long
MAX_SESSIONS_PER_POST = 500

LINE = re.compile(r'^(\d+): session (\d+): (.*)$')
ALLOC = re.compile(r'^(new|refreshed), realm=<[^>]*>, username=<([^>]*)>, lifetime=(\d+)')
USAGE = re.compile(r'^(peer )?usage: realm=<[^>]*>, username=<[^>]*>, rp=\d+, rb=(\d+), sp=\d+, sb=(\d+)')
CLOSED = re.compile(r'^closed \(2nd stage\), user <[^>]*>.*reason: (.*)$')
BINDING = 'incoming packet BINDING processed'


def reco_username(turn_username: str) -> str:
    """'1791081945:alice' -> 'alice'"""
    return turn_username.split(':', 1)[1] if ':' in turn_username else turn_username


def day_of(t: float) -> str:
    return time.strftime('%Y-%m-%d', time.gmtime(t))


def parse(lines, started: float, state: dict) -> None:
    """Fold coturn log lines into `state` ({'sessions': {key: session}, 'stun': {day: n}}).
    `started` is when coturn started (Unix time); a session's key is '<started>:<id>'."""
    sessions, stun = state['sessions'], state['stun']
    for raw in lines:
        m = LINE.match(raw.rstrip('\n'))
        if not m:
            continue
        t = started + int(m.group(1))
        sid, rest = m.group(2), m.group(3)
        if BINDING in rest:
            day = day_of(t)
            stun[day] = stun.get(day, 0) + 1
            continue
        key = f'{int(started)}:{sid}'
        alloc = ALLOC.match(rest)
        if alloc:
            if not alloc.group(2):
                continue
            s = sessions.get(key)
            if s is None:
                s = sessions[key] = {
                    'server_start': int(started),
                    'session': sid,
                    'username': reco_username(alloc.group(2)),
                    'started_at': t,
                    'client_bytes': 0,
                    'relay_bytes': 0,
                }
            s['last_seen'] = max(s.get('last_seen', t), t)
            s['dirty'] = True
            continue
        s = sessions.get(key)
        if s is None:  # an anonymous probe, never signed in
            continue
        usage = USAGE.match(rest)
        if usage:
            field = 'relay_bytes' if usage.group(1) else 'client_bytes'
            s[field] += int(usage.group(2)) + int(usage.group(3))
            s['last_seen'] = max(s['last_seen'], t)
            s['dirty'] = True
            continue
        closed = CLOSED.match(rest)
        if closed:
            s['ended_at'] = t
            s['reason'] = closed.group(1)[:120]
            s['last_seen'] = max(s['last_seen'], t)
            s['dirty'] = True


def payload(state: dict, now: float) -> dict:
    changed = [s for s in state['sessions'].values() if s.get('dirty')][:MAX_SESSIONS_PER_POST]
    return {
        'sent_at': now,
        'sessions': [{k: v for k, v in s.items() if k != 'dirty'} for s in changed],
        'stun': state['stun'],
    }


def after_post(state: dict, sent: dict, now: float) -> None:
    """Forget what the server now has: ended sessions, stale ones, old STUN days."""
    sent_keys = {f'{s["server_start"]}:{s["session"]}' for s in sent['sessions']}
    for key in list(state['sessions']):
        s = state['sessions'][key]
        if key in sent_keys:
            s.pop('dirty', None)
        if (not s.get('dirty') and s.get('ended_at')) or now - s['last_seen'] > STALE:
            del state['sessions'][key]
    oldest = day_of(now - STUN_DAYS * 86400)
    state['stun'] = {d: n for d, n in state['stun'].items() if d > oldest}


# ── on the host ───────────────────────────────────────────────


def coturn_started() -> float:
    """When the running coturn started, from /proc (boot time + its start in clock ticks)."""
    with open(PIDFILE) as f:
        pid = f.read().strip()
    with open(f'/proc/{pid}/stat') as f:
        ticks = int(f.read().rsplit(')', 1)[1].split()[19])
    with open('/proc/stat') as f:
        boot = next(int(line.split()[1]) for line in f if line.startswith('btime '))
    return boot + ticks / os.sysconf('SC_CLK_TCK')


def shared_secret() -> str:
    with open(CONF) as f:
        for line in f:
            if line.startswith('static-auth-secret='):
                return line.split('=', 1)[1].strip()
    raise SystemExit('no static-auth-secret in ' + CONF)


def read_log(started: float, state: dict) -> None:
    """Fold in what coturn has logged since last time, then start the log over empty. Read line
    by line: after a long outage it can be gigabytes. coturn appends, so after the truncate it
    writes from the start again (a line written in between is lost)."""
    try:
        with open(LOG, 'r+', errors='replace') as f:
            parse(f, started, state)
            f.truncate(0)
    except FileNotFoundError:
        pass


def post(body: bytes, secret: str) -> None:
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        URL,
        data=body,
        method='POST',
        headers={'Content-Type': 'application/json', 'X-Reco-Signature': signature},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        response.read()


def main() -> None:
    import fcntl  # Unix only (the tests import this module on any system)

    os.makedirs(STATE_DIR, exist_ok=True)
    state_file = os.path.join(STATE_DIR, 'state.json')
    with open(os.path.join(STATE_DIR, 'lock'), 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return  # the last run is still going
        try:
            with open(state_file) as f:
                state = json.load(f)
        except (FileNotFoundError, ValueError):
            state = {'sessions': {}, 'stun': {}}
        read_log(coturn_started(), state)
        now = time.time()
        sent = payload(state, now)
        try:
            post(json.dumps(sent).encode(), shared_secret())
            after_post(state, sent, now)
        except Exception as e:  # kept for next time
            print(f'reco-turn-report: post failed: {e}', file=sys.stderr)
        tmp = state_file + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(state, f)
        os.replace(tmp, state_file)


if __name__ == '__main__':
    main()

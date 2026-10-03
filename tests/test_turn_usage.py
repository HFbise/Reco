"""TURN usage: the coturn host's reporter (deploy/turn) and what it posts, through to the admin page."""

import hashlib
import hmac
import importlib.util
import json
import os
import time
from datetime import datetime, timedelta

from conftest import app, query

import turn_usage

_spec = importlib.util.spec_from_file_location(
    'reco_turn_report', os.path.join(os.path.dirname(__file__), '..', 'deploy', 'turn', 'reco_turn_report.py')
)
reporter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(reporter)

STARTED = 1_790_000_000  # when coturn started
LOG = """\
5: session 000000000000000007: realm <1.2.3.4> user <>: incoming packet message processed, error 401: Unauthorized
5: session 000000000000000007: new, realm=<1.2.3.4>, username=<1790086400:alice>, lifetime=600
5: session 000000000000000007: realm <1.2.3.4> user <1790086400:alice>: incoming packet ALLOCATE processed, success
6: session 001000000000000003: realm <1.2.3.4> user <>: incoming packet BINDING processed, success
9: session 001000000000000004: realm <1.2.3.4> user <>: incoming packet BINDING processed, success
20: session 001000000000000003: usage: realm=<1.2.3.4>, username=<>, rp=1024, rb=20480, sp=1024, sb=110592
40: session 000000000000000007: usage: realm=<1.2.3.4>, username=<1790086400:alice>, rp=1024, rb=1000, sp=1024, sb=2000
41: session 000000000000000007: peer usage: realm=<1.2.3.4>, username=<1790086400:alice>, rp=1024, rb=50000, sp=1024, sb=60000
300: session 000000000000000007: refreshed, realm=<1.2.3.4>, username=<1790086400:alice>, lifetime=600
330: session 000000000000000007: usage: realm=<1.2.3.4>, username=<1790086400:alice>, rp=10, rb=100, sp=10, sb=200
331: session 001000000000000003: closed (2nd stage), user <> realm <1.2.3.4> origin <>, local 10.0.0.26:3478, remote 5.6.7.8:1, reason: allocation watchdog determined stale session state
360: session 000000000000000007: closed (2nd stage), user <1790086400:alice> realm <1.2.3.4> origin <>, local 10.0.0.26:3478, remote 5.6.7.8:2, reason: allocation timeout
this line is not from a session
"""


def fresh():
    return {'sessions': {}, 'stun': {}}


def signed_post(payload, secret='test-turn'):
    body = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return app.test_client().post(
        '/api/turn/report', data=body, headers={'X-Reco-Signature': signature, 'Content-Type': 'application/json'}
    )


def admin_page(path='/admin/turn'):
    web = app.test_client()
    web.post('/admin/login', data={'password': 'test-admin'})
    return web.get(path).get_data(as_text=True)


# ── the reporter, on the coturn host ──────────────────────────


def test_the_reporter_keeps_signed_in_sessions_and_counts_stun_probes():
    state = fresh()
    reporter.parse(LOG.splitlines(keepends=True), STARTED, state)
    (session,) = state['sessions'].values()  # the anonymous probe isn't one
    assert session == {
        'server_start': STARTED,
        'session': '000000000000000007',
        'username': 'alice',
        'started_at': STARTED + 5,
        'last_seen': STARTED + 360,
        'ended_at': STARTED + 360,
        'reason': 'allocation timeout',
        'client_bytes': 1000 + 2000 + 100 + 200,  # traffic comes in chunks: added up
        'relay_bytes': 50000 + 60000,
        'dirty': True,
    }
    assert state['stun'] == {reporter.day_of(STARTED): 2}


def test_the_reporter_forgets_what_the_server_has():
    state = fresh()
    reporter.parse(LOG.splitlines()[:3], STARTED, state)  # alice, still relaying
    now = STARTED + 400
    sent = reporter.payload(state, now)
    assert [s['username'] for s in sent['sessions']] == ['alice'] and 'dirty' not in sent['sessions'][0]
    reporter.after_post(state, sent, now)
    assert reporter.payload(state, now)['sessions'] == []  # unchanged: not sent again
    reporter.parse(LOG.splitlines()[-2:], STARTED, state)  # then it ends
    sent = reporter.payload(state, now)
    assert sent['sessions'][0]['ended_at'] == STARTED + 360
    reporter.after_post(state, sent, now)
    assert state['sessions'] == {}


def test_a_failed_post_is_sent_again():
    state = fresh()
    reporter.parse(LOG.splitlines(), STARTED, state)
    first = reporter.payload(state, STARTED + 400)
    # no after_post: the post failed
    assert reporter.payload(state, STARTED + 460)['sessions'] == first['sessions']


# ── the server ────────────────────────────────────────────────


def report(now=None):
    state = fresh()
    reporter.parse(LOG.splitlines(), STARTED, state)
    return reporter.payload(state, now or time.time())


def test_a_report_must_be_signed_and_recent():
    payload = report()
    assert signed_post(payload, secret='wrong').status_code == 403
    assert app.test_client().post('/api/turn/report', json=payload).status_code == 403
    assert signed_post(report(now=time.time() - 3600)).status_code == 403
    assert query('SELECT * FROM turn_sessions') == []
    assert signed_post(payload).get_json() == {'ok': True, 'sessions': 1}
    (row,) = query('SELECT username, client_bytes, relay_bytes, reason FROM turn_sessions')
    assert row == {'username': 'alice', 'client_bytes': 3300, 'relay_bytes': 110000, 'reason': 'allocation timeout'}


def test_the_same_report_twice_counts_once():
    payload = report()
    signed_post(payload)
    payload['sessions'][0]['relay_bytes'] = 5  # an older, smaller copy
    signed_post(payload)
    assert query('SELECT relay_bytes FROM turn_sessions')[0]['relay_bytes'] == 110000


def test_nonsense_in_a_report_is_skipped():
    payload = report()
    payload['sessions'] += [{'session': '1'}, 'x', {**payload['sessions'][0], 'username': ''}]
    payload['stun'] = {'not a day': 5, '1999-01-01': 9}
    assert signed_post(payload).get_json()['sessions'] == 1
    assert [r['stun_requests'] for r in query('SELECT stun_requests FROM turn_daily')] == [0]  # today's heartbeat


def test_the_admin_page_shows_usage():
    assert '还没收到过上报' in admin_page()
    now = time.time()
    state = fresh()
    # alice for 30 s; bob from 10 s in and still relaying
    lines = [
        '0: session 000000000000000002: new, realm=<r>, username=<1:alice>, lifetime=600',
        '10: session 000000000000000001: new, realm=<r>, username=<1:bob>, lifetime=600',
        '30: session 000000000000000002: closed (2nd stage), user <1:alice> realm <r> origin <>, reason: allocation timeout',
        '40: session 000000000000000001: peer usage: realm=<r>, username=<1:bob>, rp=1, rb=1048576, sp=1, sb=1048576',
        '40: session 000000000000000003: realm <r> user <>: incoming packet BINDING processed, success',
    ]
    reporter.parse(lines, now - 60, state)
    assert signed_post(reporter.payload(state, now)).status_code == 200
    page = admin_page()
    assert '上报正常' in page
    assert '2.0 MB' in page  # bob's relayed traffic
    assert 'alice' in page and 'bob' in page and '进行中' in page

    def stat(label):
        return page.split(f'</div><div class="stat-label">{label}')[0].rsplit('>', 1)[1]

    assert (stat('正在中继'), stat('7 天会话'), stat('7 天用户'), stat('30 天最高同时')) == ('1', '2', '2', '2')


def test_peak_counts_overlaps_only():
    t = datetime(2026, 10, 1, 12)
    h = timedelta(hours=1)
    assert turn_usage._peak([(t, t + h), (t + h, t + 2 * h)], t - h, t + 3 * h) == 1  # back to back
    assert turn_usage._peak([(t, t + 2 * h), (t + h, t + 3 * h), (t, t + 3 * h)], t - h, t + 4 * h) == 3
    assert turn_usage._peak([(t, t + h)], t + 2 * h, t + 3 * h) == 0

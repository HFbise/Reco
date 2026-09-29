"""Browser errors reported to the backend (and on to Sentry when it's configured)."""

import pytest
from conftest import app

import client_errors


@pytest.fixture(autouse=True)
def fresh_limit():
    client_errors._recent.clear()


def post(body):
    return app.test_client().post('/api/client-errors', json=body)


def test_a_browser_error_is_accepted_and_logged(caplog):
    res = post({'message': 'boom', 'stack': 'at x (app.js:1)', 'url': 'https://reco/', 'kind': 'uncaught'})
    assert res.status_code == 204
    assert any('boom' in r.getMessage() for r in caplog.records)


def test_reports_need_a_message():
    assert post({}).status_code == 400
    assert post({'message': 123}).status_code == 400
    assert app.test_client().post('/api/client-errors', data='not json').status_code == 400


def test_a_crash_loop_cannot_flood_the_reports():
    codes = [post({'message': f'e{i}'}).status_code for i in range(client_errors.PER_MINUTE + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {204}

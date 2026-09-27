"""Error monitoring (Sentry). Enabled only when SENTRY_DSN is set, so local
development and tests never report anything.

Every `log.exception(...)` in an except block becomes a Sentry issue with its
stack trace (the SDK's logging integration forwards ERROR-level records), and
uncaught Socket.IO handler errors are reported by `report_socket_error`.
Authenticated handlers run in their own scope tagged with the event and user
(see auth_session.authenticated).
"""
import logging
import os

import sentry_sdk

log = logging.getLogger(__name__)
enabled = False


def init():
    global enabled
    dsn = os.environ.get('SENTRY_DSN')
    if not dsn:
        return
    sentry_sdk.init(
        dsn=dsn,
        environment='production' if os.environ.get('RENDER') else 'development',
        release=os.environ.get('RENDER_GIT_COMMIT'),  # set by Render: ties errors to the deployed commit
        send_default_pii=False,   # no IPs / cookies / headers; the username is attached explicitly
        traces_sample_rate=0,     # errors only; no performance tracing
    )
    enabled = True
    log.info('Sentry error monitoring enabled')


def report_socket_error(e: Exception):
    """Default handler for exceptions escaping a Socket.IO handler."""
    log.exception('unhandled socket error: %s', e)

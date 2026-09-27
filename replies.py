"""Failure replies for Socket.IO events.

The server sends a stable error code plus parameters, never display text; the
client translates `code` into the user's language (see app/src/lib/i18n.ts,
keys prefixed `srv-`). This lets one room hold English and Chinese users.
"""
from flask_socketio import emit


def fail(event: str, code: str, params: dict | None = None, **extra):
    """emit(event, {'success': False, 'code': code, 'params': {...}, **extra})"""
    emit(event, {'success': False, 'code': code, 'params': params or {}, **extra})

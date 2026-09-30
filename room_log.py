"""A room's moderation log: who kicked, muted, promoted or recalled what, and when.

Room owners and admins read it from the room card; the site admin's actions (the
/admin panel) are logged too, under the actor 'admin' (not a chat account).
"""

import json
import logging

from db import get_db

log = logging.getLogger(__name__)

CREATE = """CREATE TABLE IF NOT EXISTS room_log (
    id SERIAL PRIMARY KEY, room TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
    target TEXT, detail JSONB, created_at TIMESTAMPTZ DEFAULT NOW())"""

SITE_ADMIN = 'admin'
PAGE = 50


def migrate(cur):
    cur.execute(CREATE)
    cur.execute('CREATE INDEX IF NOT EXISTS room_log_room_idx ON room_log(room, id)')


def record(room: str, actor: str, action: str, target: str | None = None, **detail):
    """Log one action. Never raises: a moderation step that worked isn't undone by its log line."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                'INSERT INTO room_log (room, actor, action, target, detail) VALUES (%s, %s, %s, %s, %s)',
                (room, actor, action, target, json.dumps(detail) if detail else None),
            )
            conn.commit()
    except Exception as e:
        log.exception('room_log error: %s', e)


def page(cur, room: str, before_id: int = 0) -> tuple[list[dict], bool]:
    """Newest first, with display names; (entries, has_more)."""
    cur.execute(
        'SELECT l.id, l.actor, l.action, l.target, l.detail, l.created_at,'
        ' a.screenname AS actor_name, t.screenname AS target_name FROM room_log l'
        ' LEFT JOIN users a ON a.username = l.actor LEFT JOIN users t ON t.username = l.target'
        ' WHERE l.room = %s AND (%s = 0 OR l.id < %s) ORDER BY l.id DESC LIMIT %s',
        (room, before_id, before_id, PAGE + 1),
    )
    rows = cur.fetchall()
    entries = [
        {
            'id': r['id'],
            'actor': r['actor'],
            'actor_name': r['actor_name'] or r['actor'],
            'action': r['action'],
            'target': r['target'],
            'target_name': r['target_name'] or r['target'],
            'detail': r['detail'] or {},
            'time': r['created_at'].isoformat(),
        }
        for r in rows[:PAGE]
    ]
    return entries, len(rows) > PAGE

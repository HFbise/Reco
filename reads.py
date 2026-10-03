"""Unread counts that follow you across devices: how far each person has read in each room and DM.

A read mark is the id of the newest message someone has seen in a room. It moves forward when
they open the room and while they watch new messages arrive; it never moves back. Unread =
messages after the mark, not written by them, not system notices.
"""

CREATE = """CREATE TABLE IF NOT EXISTS read_marks (
    username TEXT NOT NULL, room TEXT NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (username, room))"""


def migrate(cur):
    """Create the table. The first time only, count everything already there as read, so nobody
    logs in to a wall of old 'unread' badges; from then on marks only move when people read."""
    cur.execute("SELECT to_regclass('read_marks') IS NOT NULL AS present")
    existed = cur.fetchone()['present']
    cur.execute(CREATE)
    cur.execute('CREATE INDEX IF NOT EXISTS messages_room_id_idx ON messages(room, id)')
    if existed:
        return
    # Room members, and both people in every DM
    cur.execute(
        'INSERT INTO read_marks (username, room, last_read_id)'
        ' SELECT m, r.name, COALESCE((SELECT MAX(id) FROM messages WHERE room = r.name), 0)'
        ' FROM rooms r, unnest(r.members) AS m ON CONFLICT DO NOTHING'
    )
    cur.execute(
        'INSERT INTO read_marks (username, room, last_read_id)'
        ' SELECT p.who, d.room, d.last_id FROM ('
        "   SELECT room, MAX(id) AS last_id FROM messages WHERE room LIKE 'dm:%%' GROUP BY room) d,"
        "   LATERAL (VALUES (split_part(d.room, ':', 2)), (split_part(d.room, ':', 3))) AS p(who)"
        ' ON CONFLICT DO NOTHING'
    )


def mark_read(cur, username: str, room: str, upto_id: int | None = None):
    """Move `username`'s mark in `room` to `upto_id` (default: the newest message). Never backwards."""
    if upto_id is None:
        cur.execute('SELECT COALESCE(MAX(id), 0) AS last FROM messages WHERE room = %s', (room,))
        upto_id = cur.fetchone()['last']
    cur.execute(
        'INSERT INTO read_marks (username, room, last_read_id) VALUES (%s, %s, %s)'
        ' ON CONFLICT (username, room) DO UPDATE'
        ' SET last_read_id = GREATEST(read_marks.last_read_id, EXCLUDED.last_read_id)',
        (username, room, upto_id),
    )


def unread_counts(cur, username: str, rooms: list[str]) -> dict[str, int]:
    """Unread messages per room. Without a mark, a DM (never opened) counts from its start, while a
    room counts as read: the lobby is listed for everyone, and its whole history isn't news."""
    if not rooms:
        return {}
    cur.execute(
        'SELECT m.room, COUNT(*) AS n FROM messages m'
        ' LEFT JOIN read_marks r ON r.username = %s AND r.room = m.room'
        ' WHERE m.room = ANY(%s)'
        " AND m.id > COALESCE(r.last_read_id, CASE WHEN m.room LIKE 'dm:%%' THEN 0 ELSE 2147483647 END)"
        ' AND m.username <> %s AND NOT COALESCE(m.system, FALSE) AND NOT COALESCE(m.recalled, FALSE)'
        ' GROUP BY m.room',
        (username, list(rooms), username),
    )
    return {r['room']: r['n'] for r in cur.fetchall()}


def mentioned_in(cur, username: str, rooms: list[str]) -> set[str]:
    """Rooms with an unread message @mentioning `username`, or @everyone (see mentions.py). Unlike the unread
    count, a room never opened (no mark) counts too: being named is news wherever it happens."""
    if not rooms:
        return set()
    cur.execute(
        'SELECT DISTINCT m.room FROM messages m'
        ' LEFT JOIN read_marks r ON r.username = %s AND r.room = m.room'
        ' WHERE m.room = ANY(%s) AND m.id > COALESCE(r.last_read_id, 0) AND m.username <> %s'
        " AND NOT COALESCE(m.recalled, FALSE) AND (m.meta->'mentions' ? %s OR m.meta ? 'everyone')",
        (username, list(rooms), username, username),
    )
    return {r['room'] for r in cur.fetchall()}

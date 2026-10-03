"""Pinned messages: the few messages a chat keeps at hand above its history.

In a room the owner and admins pin; in a DM either person does. A recalled message comes off
the list, and a closed room takes its pins with it. The list is read with each message's current
text, so an edit shows there too.
"""

MAX_PER_CHAT = 20
PREVIEW_LEN = 200


def migrate(cur):
    cur.execute("""CREATE TABLE IF NOT EXISTS pinned_messages (
        room TEXT NOT NULL, message_id INTEGER NOT NULL, pinned_by TEXT NOT NULL,
        pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (room, message_id))""")


def listed(cur, room: str) -> list[dict]:
    """The chat's pins, most recently pinned first, as clients show them."""
    cur.execute(
        'SELECT m.id, m.username, m.screenname, m.text, m.meta, p.pinned_by, p.pinned_at'
        ' FROM pinned_messages p JOIN messages m ON m.id = p.message_id'
        ' WHERE p.room = %s AND NOT COALESCE(m.recalled, FALSE) ORDER BY p.pinned_at DESC, m.id DESC',
        (room,),
    )
    return [
        {
            'id': r['id'],
            'username': r['username'],
            'screenname': r['screenname'] or r['username'],
            'text': (r['text'] or '')[:PREVIEW_LEN],
            'image': bool((r['meta'] or {}).get('image')),
            'pinned_by': r['pinned_by'],
            'pinned_at': r['pinned_at'].isoformat(),
        }
        for r in cur.fetchall()
    ]


def pin(cur, room: str, message_id: int, by: str) -> bool:
    """False when the chat already has MAX_PER_CHAT pins (pinning one again changes nothing)."""
    cur.execute('SELECT COUNT(*) AS n FROM pinned_messages WHERE room = %s', (room,))
    if cur.fetchone()['n'] >= MAX_PER_CHAT:
        cur.execute('SELECT 1 FROM pinned_messages WHERE room = %s AND message_id = %s', (room, message_id))
        return cur.fetchone() is not None
    cur.execute(
        'INSERT INTO pinned_messages (room, message_id, pinned_by) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING',
        (room, message_id, by),
    )
    return True


def unpin(cur, message_id: int) -> str | None:
    """Take a message off its chat's pins; the chat's room if it was pinned."""
    cur.execute('DELETE FROM pinned_messages WHERE message_id = %s RETURNING room', (message_id,))
    row = cur.fetchone()
    return row['room'] if row else None

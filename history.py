"""Message history: the one place that reads messages back out for clients."""

PAGE_SIZE = 50


def serialize(msg: dict) -> dict:
    """A stored message as clients receive it."""
    return {
        'id': msg['id'],
        'username': msg['username'],
        'screenname': msg['screenname'],
        'text': msg['text'],
        'time': msg['created_at'].isoformat() if msg.get('created_at') else msg['time'],
        'room': msg['room'],
        'recalled': bool(msg.get('recalled')),
        'edited': bool(msg.get('edited')),
        'reactions': dict(msg.get('reactions') or {}),
        'system': bool(msg.get('system')),
        'meta': dict(msg['meta']) if msg.get('meta') else None,
    }


def recent(cur, room: str, since: str | None = None) -> tuple[list[dict], bool]:
    """Messages to show when a client opens `room`, oldest first.

    With `since` (the newest message the client has cached) only newer ones are
    returned, unless more than a page arrived meanwhile: then the latest page is
    returned and `reset` is True, telling the client to drop its cached copy so
    it doesn't show a gap. Older pages come from `older()`.
    """
    if since:
        cur.execute(
            'SELECT * FROM messages WHERE room = %s AND created_at > %s ORDER BY created_at DESC, id DESC LIMIT %s',
            (room, since, PAGE_SIZE + 1),
        )
        rows = cur.fetchall()
        if len(rows) <= PAGE_SIZE:
            return [serialize(m) for m in reversed(rows)], False
        rows = rows[:PAGE_SIZE]
        return [serialize(m) for m in reversed(rows)], True
    cur.execute('SELECT * FROM messages WHERE room = %s ORDER BY created_at DESC, id DESC LIMIT %s', (room, PAGE_SIZE))
    return [serialize(m) for m in reversed(cur.fetchall())], False


def older(cur, room: str, before_id: int) -> tuple[list[dict], bool]:
    """The page of messages just before `before_id`, oldest first, and whether more exist."""
    cur.execute(
        'SELECT * FROM messages WHERE room = %s AND id < %s ORDER BY id DESC LIMIT %s',
        (room, before_id, PAGE_SIZE + 1),
    )
    rows = cur.fetchall()
    has_more = len(rows) > PAGE_SIZE
    return [serialize(m) for m in reversed(rows[:PAGE_SIZE])], has_more

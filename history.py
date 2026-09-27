"""Message history: the one place that reads messages back out for clients."""

PAGE_SIZE = 50

# Messages with their sender's current avatar (deleted/system senders have none)
_SELECT = (
    'SELECT m.*, u.avatar_expression, u.avatar_color FROM messages m'
    ' LEFT JOIN users u ON u.username = m.username WHERE m.room = %s'
)


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
        'avatar_expression': msg.get('avatar_expression'),
        'avatar_color': msg.get('avatar_color'),
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
            _SELECT + ' AND m.created_at > %s ORDER BY m.created_at DESC, m.id DESC LIMIT %s',
            (room, since, PAGE_SIZE + 1),
        )
        rows = cur.fetchall()
        if len(rows) <= PAGE_SIZE:
            return [serialize(m) for m in reversed(rows)], False
        rows = rows[:PAGE_SIZE]
        return [serialize(m) for m in reversed(rows)], True
    cur.execute(_SELECT + ' ORDER BY m.created_at DESC, m.id DESC LIMIT %s', (room, PAGE_SIZE))
    return [serialize(m) for m in reversed(cur.fetchall())], False


def older(cur, room: str, before_id: int) -> tuple[list[dict], bool]:
    """The page of messages just before `before_id`, oldest first, and whether more exist."""
    cur.execute(
        _SELECT + ' AND m.id < %s ORDER BY m.id DESC LIMIT %s',
        (room, before_id, PAGE_SIZE + 1),
    )
    rows = cur.fetchall()
    has_more = len(rows) > PAGE_SIZE
    return [serialize(m) for m in reversed(rows[:PAGE_SIZE])], has_more


def has_older(cur, room: str, oldest_id) -> bool:
    """Whether `room` has messages before `oldest_id` (the oldest one the client holds)."""
    if not isinstance(oldest_id, int):
        return False
    cur.execute('SELECT 1 FROM messages WHERE room = %s AND id < %s LIMIT 1', (room, oldest_id))
    return cur.fetchone() is not None


def oldest_shown(messages: list[dict], client_oldest_id):
    """The oldest message id the client will have after this history is applied."""
    ids = [m['id'] for m in messages if isinstance(m.get('id'), int)]
    if isinstance(client_oldest_id, int):
        ids.append(client_oldest_id)
    return min(ids) if ids else None

"""Message history: the one place that reads messages back out for clients."""

PAGE_SIZE = 50

QUOTE_LEN = 140  # a reply shows the start of the message it answers

# Messages with their sender's current avatar (deleted/system senders have none) and,
# for replies, the message they answer (only ever from the same room)
_SELECT = (
    'SELECT m.*, u.avatar_expression, u.avatar_color,'
    ' r.username AS reply_username, r.screenname AS reply_screenname,'
    ' r.text AS reply_text, r.recalled AS reply_recalled FROM messages m'
    ' LEFT JOIN users u ON u.username = m.username'
    ' LEFT JOIN messages r ON r.id = m.reply_to AND r.room = m.room'
    ' WHERE m.room = %s'
)


def quote(msg_id: int, username: str, screenname: str, text: str, recalled: bool) -> dict:
    """What a reply shows of the message it answers. A recalled message's text is never sent."""
    return {
        'id': msg_id,
        'username': username,
        'screenname': screenname,
        'text': '' if recalled else (text or '')[:QUOTE_LEN],
        'recalled': bool(recalled),
    }


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
        'reply': quote(
            msg['reply_to'], msg['reply_username'], msg['reply_screenname'], msg['reply_text'], msg['reply_recalled']
        )
        if msg.get('reply_to') and msg.get('reply_username')
        else None,
    }


def one(cur, room: str, msg_id: int) -> dict | None:
    """One message of `room` as clients receive it."""
    cur.execute(_SELECT + ' AND m.id = %s', (room, msg_id))
    row = cur.fetchone()
    return serialize(row) if row else None


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

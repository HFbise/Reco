"""One person's settings for one chat (room or DM): pinned to the top of their list, and
notifications muted. Kept on the server so every device agrees."""

CREATE = """CREATE TABLE IF NOT EXISTS chat_prefs (
    username TEXT NOT NULL, room TEXT NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE, muted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (username, room))"""

DEFAULT = {'pinned': False, 'muted': False}


def migrate(cur):
    cur.execute(CREATE)
    cur.execute('CREATE INDEX IF NOT EXISTS chat_prefs_room_idx ON chat_prefs(room)')


def for_user(cur, username: str, rooms: list[str]) -> dict[str, dict]:
    """{room: {'pinned', 'muted'}} for the chats that have settings; others use DEFAULT."""
    if not rooms:
        return {}
    cur.execute(
        'SELECT room, pinned, muted FROM chat_prefs WHERE username = %s AND room = ANY(%s)', (username, list(rooms))
    )
    return {r['room']: {'pinned': r['pinned'], 'muted': r['muted']} for r in cur.fetchall()}


def muted_by(cur, room: str, usernames) -> set[str]:
    """Which of `usernames` turned notifications off for `room`."""
    usernames = list(usernames)
    if not usernames:
        return set()
    cur.execute('SELECT username FROM chat_prefs WHERE room = %s AND muted AND username = ANY(%s)', (room, usernames))
    return {r['username'] for r in cur.fetchall()}


def update(cur, username: str, room: str, pinned: bool | None = None, muted: bool | None = None) -> dict:
    """Change the given settings (None leaves one as it is); returns both."""
    cur.execute(
        'INSERT INTO chat_prefs (username, room, pinned, muted) VALUES (%s, %s, COALESCE(%s, FALSE), COALESCE(%s, FALSE))'
        ' ON CONFLICT (username, room) DO UPDATE SET pinned = COALESCE(%s, chat_prefs.pinned),'
        ' muted = COALESCE(%s, chat_prefs.muted) RETURNING pinned, muted',
        (username, room, pinned, muted, pinned, muted),
    )
    row = cur.fetchone()
    return {'pinned': row['pinned'], 'muted': row['muted']}

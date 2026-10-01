"""A person's own settings that every device shares, so they live on the server: who may
message them first, whether others see them online, and which notifications they get.
(Settings for one device only, like theme or text size, stay on that device.)"""

from state import LOBBY

# Who may start a DM with you. An existing conversation always carries on.
DM_FROM = ('everyone', 'rooms', 'nobody')

DEFAULTS = {'dm_from': 'everyone', 'show_online': True, 'push_dms': True, 'push_matches': True}
_FLAGS = ('show_online', 'push_dms', 'push_matches')


def migrate(cur):
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS dm_from TEXT NOT NULL DEFAULT 'everyone'")
    for flag in _FLAGS:
        cur.execute(f'ALTER TABLE users ADD COLUMN IF NOT EXISTS {flag} BOOLEAN NOT NULL DEFAULT TRUE')


def get(cur, username: str) -> dict:
    cur.execute(f'SELECT dm_from, {", ".join(_FLAGS)} FROM users WHERE username = %s', (username,))
    row = cur.fetchone()
    return {key: row[key] for key in DEFAULTS} if row else dict(DEFAULTS)


def clean(data) -> dict:
    """The valid changes in `data`; anything else is dropped."""
    if not isinstance(data, dict):
        return {}
    changes = {flag: data[flag] for flag in _FLAGS if isinstance(data.get(flag), bool)}
    if data.get('dm_from') in DM_FROM:
        changes['dm_from'] = data['dm_from']
    return changes


def update(cur, username: str, changes: dict) -> dict:
    """Apply `changes` (already clean()ed); returns every setting."""
    if changes:
        columns = ', '.join(f'{key} = %s' for key in changes)
        cur.execute(f'UPDATE users SET {columns} WHERE username = %s', (*changes.values(), username))
    return get(cur, username)


def wants_push(cur, usernames, kind: str) -> list[str]:
    """Which of `usernames` get push notifications of `kind` ('dms' or 'matches')."""
    usernames = list(usernames)
    if not usernames:
        return []
    column = {'dms': 'push_dms', 'matches': 'push_matches'}[kind]
    cur.execute(f'SELECT username FROM users WHERE username = ANY(%s) AND {column}', (usernames,))
    return [r['username'] for r in cur.fetchall()]


def shows_online(cur, username: str) -> bool:
    cur.execute('SELECT show_online FROM users WHERE username = %s', (username,))
    row = cur.fetchone()
    return row['show_online'] if row else True


def may_message(cur, sender: str, recipient: str, dm_room: str) -> bool:
    """May `sender` send in their DM with `recipient`? Always once the chat has begun
    (anything in it, including a match's "you're connected"); before that, it's up to
    the recipient: anyone, people sharing a room with them (not the lobby), or nobody."""
    cur.execute('SELECT 1 FROM messages WHERE room = %s LIMIT 1', (dm_room,))
    if cur.fetchone():
        return True
    rule = get(cur, recipient)['dm_from']
    if rule == 'everyone':
        return True
    if rule == 'nobody':
        return False
    inside = '(%s = ANY(members) OR %s = ANY(admins) OR owner = %s)'
    cur.execute(
        f'SELECT 1 FROM rooms WHERE name <> %s AND {inside} AND {inside} LIMIT 1',
        (LOBBY, sender, sender, sender, recipient, recipient, recipient),
    )
    return cur.fetchone() is not None

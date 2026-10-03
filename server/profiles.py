"""Everything about a person beyond their name and face, kept on the server.

Their own settings, the same on every device: who may message them first, whether others see
them online, which notifications they get. (Settings for one device, like theme or text size,
stay on that device.)

What their card shows (card()):
- When they signed up (users.created_at; accounts from before it was recorded have none).
- When they were last online, as you could see it: the last time they were online while
  showing it (users.last_seen), or their last DM to you, whichever is later. Someone who hides
  their status still counts as online to the person they're writing to, like Steam.
- Rooms you share (not the lobby, which everyone shares).
- In a room: their rank, whether they're in voice, and, for its moderators, their mutes.
- Your nickname for them, seen only by you (user_nicknames).
"""

from datetime import datetime

from state import LOBBY, appears_online, get_level

# Who may start a DM with you. An existing conversation always carries on.
DM_FROM = ('everyone', 'rooms', 'nobody')

DEFAULTS = {'dm_from': 'everyone', 'show_online': True, 'push_dms': True, 'push_mentions': True, 'push_matches': True}
_FLAGS = ('show_online', 'push_dms', 'push_mentions', 'push_matches')

MAX_NICKNAME_LEN = 32


def migrate(cur):
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS dm_from TEXT NOT NULL DEFAULT 'everyone'")
    for flag in _FLAGS:
        cur.execute(f'ALTER TABLE users ADD COLUMN IF NOT EXISTS {flag} BOOLEAN NOT NULL DEFAULT TRUE')
    # Added without a default first: existing accounts get no made-up sign-up date
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ')
    cur.execute('ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW()')
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ')
    # Suspended by the site admin until then (see moderation.suspend)
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ')
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspend_reason TEXT')
    cur.execute(
        'CREATE TABLE IF NOT EXISTS user_nicknames (owner TEXT NOT NULL, target TEXT NOT NULL,'
        ' nickname TEXT NOT NULL, PRIMARY KEY (owner, target))'
    )


def _dm_room(a: str, b: str) -> str:
    # moderation.dm_room_id, which can't be imported here: auth_session imports this module
    return 'dm:' + ':'.join(sorted([a, b]))


# ── settings ──────────────────────────────────────────────────


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
    """Which of `usernames` get push notifications of `kind` ('dms', 'mentions' or 'matches')."""
    usernames = list(usernames)
    if not usernames:
        return []
    column = {'dms': 'push_dms', 'mentions': 'push_mentions', 'matches': 'push_matches'}[kind]
    cur.execute(f'SELECT username FROM users WHERE username = ANY(%s) AND {column}', (usernames,))
    return [r['username'] for r in cur.fetchall()]


def touch_last_seen(cur, username: str):
    """Seen online just now (only called while they show it)."""
    cur.execute('UPDATE users SET last_seen = NOW() WHERE username = %s', (username,))


def shows_online(cur, username: str) -> bool:
    cur.execute('SELECT show_online FROM users WHERE username = %s', (username,))
    row = cur.fetchone()
    return row['show_online'] if row else True


def may_message(cur, sender: str, recipient: str, dm_room: str) -> bool:
    """May `sender` send in their DM with `recipient`? Never to themselves or to an account that
    doesn't exist (any more). Always once the chat has begun (anything in it, including a match's
    "you're connected"); before that, only under the DM's one id ('dm:<a>:<b>', names sorted:
    another spelling would be a second chat with the same person), and as the recipient
    allows: anyone, people sharing a room with them (not the lobby), or nobody."""
    if sender == recipient:
        return False
    cur.execute('SELECT 1 FROM users WHERE username = %s', (recipient,))
    if not cur.fetchone():
        return False
    cur.execute('SELECT 1 FROM messages WHERE room = %s LIMIT 1', (dm_room,))
    if cur.fetchone():
        return True
    if dm_room != _dm_room(sender, recipient):
        return False
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


# ── nicknames and cards ───────────────────────────────────────


def nicknames(cur, owner: str) -> dict[str, str]:
    cur.execute('SELECT target, nickname FROM user_nicknames WHERE owner = %s', (owner,))
    return {r['target']: r['nickname'] for r in cur.fetchall()}


def set_nickname(cur, owner: str, target: str, nickname: str) -> bool:
    """Name `target` for `owner` ('' removes it). False if there's no such person."""
    cur.execute('SELECT 1 FROM users WHERE username = %s', (target,))
    if not cur.fetchone() or target == owner:
        return False
    nickname = nickname.strip()[:MAX_NICKNAME_LEN]
    if nickname:
        cur.execute(
            'INSERT INTO user_nicknames (owner, target, nickname) VALUES (%s, %s, %s)'
            ' ON CONFLICT (owner, target) DO UPDATE SET nickname = EXCLUDED.nickname',
            (owner, target, nickname),
        )
    else:
        cur.execute('DELETE FROM user_nicknames WHERE owner = %s AND target = %s', (owner, target))
    return True


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def card(cur, viewer: str, target: str, room: str | None, in_voice: bool, guest: bool) -> dict | None:
    """Everything `viewer` may see on `target`'s card, or None if there's no such person.
    `room` is the room it was opened in, if `viewer` is in it (None otherwise)."""
    cur.execute(
        'SELECT username, screenname, bio, avatar_expression, avatar_color, created_at, last_seen, show_online'
        ' FROM users WHERE username = %s',
        (target,),
    )
    user = cur.fetchone()
    if not user:
        return None
    me = viewer == target
    reply = {
        'username': user['username'],
        'screenname': user['screenname'],
        'bio': user['bio'] or '',
        'avatar_expression': user['avatar_expression'] or 'Smile',
        'avatar_color': user['avatar_color'] or '#5865F2',
        'created_at': _iso(user['created_at']),
        'online': me or appears_online(target),
        'last_seen': None,
        'mutual_rooms': [],
        'nickname': '',
        'room': None,
    }
    if guest:
        return reply

    seen = [user['last_seen']] if user['show_online'] and user['last_seen'] else []
    if not me:
        cur.execute(
            'SELECT MAX(created_at) AS at FROM messages WHERE room = %s AND username = %s',
            (_dm_room(viewer, target), target),
        )
        written = cur.fetchone()['at']
        if written:
            seen.append(written)
    reply['last_seen'] = _iso(max(seen)) if seen else None

    if not me:
        inside = '(%s = ANY(members) OR %s = ANY(admins) OR owner = %s)'
        cur.execute(
            f'SELECT name FROM rooms WHERE name <> %s AND {inside} AND {inside}'
            ' AND NOT (%s = ANY(COALESCE(kicked, ARRAY[]::TEXT[]))) ORDER BY lower(name)',
            (LOBBY, viewer, viewer, viewer, target, target, target, viewer),
        )
        reply['mutual_rooms'] = [r['name'] for r in cur.fetchall()]
        cur.execute('SELECT nickname FROM user_nicknames WHERE owner = %s AND target = %s', (viewer, target))
        row = cur.fetchone()
        reply['nickname'] = row['nickname'] if row else ''

    if room:
        cur.execute('SELECT owner, admins FROM rooms WHERE name = %s', (room,))
        row = cur.fetchone() or {}
        their, mine = get_level(target, row), get_level(viewer, row)
        info = {'level': their, 'my_level': mine, 'in_voice': in_voice, 'muted_until': None, 'voice_banned_until': None}
        info['muted'] = info['voice_banned'] = False
        if mine >= 1:  # mutes are for the room's moderators to see
            cur.execute(
                'SELECT kind, expires_at FROM room_restrictions WHERE room = %s AND username = %s'
                ' AND (expires_at IS NULL OR expires_at > NOW())',
                (room, target),
            )
            for r in cur.fetchall():
                key = 'muted' if r['kind'] == 'text' else 'voice_banned'
                info[key] = True
                info[f'{key}_until'] = _iso(r['expires_at'])
        reply['room'] = info
    return reply

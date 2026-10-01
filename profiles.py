"""What a person's card shows about them, and the names you give people.

- When they signed up (users.created_at; accounts from before it was recorded have none).
- When they were last online, as you could see it: the last time they were online while
  showing it (users.last_seen), or their last DM to you, whichever is later. Someone who hides
  their status still counts as online to the person they're writing to, like Steam.
- Rooms you share (not the lobby, which everyone shares).
- In a room: their rank, whether they're in voice, and, for its moderators, their mutes.
- Your nickname for them, seen only by you (user_nicknames).
"""

from datetime import datetime

from moderation import dm_room_id
from state import LOBBY, appears_online, get_level

MAX_NICKNAME_LEN = 32


def migrate(cur):
    # Added without a default first: existing accounts get no made-up sign-up date
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ')
    cur.execute('ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW()')
    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ')
    cur.execute(
        'CREATE TABLE IF NOT EXISTS user_nicknames (owner TEXT NOT NULL, target TEXT NOT NULL,'
        ' nickname TEXT NOT NULL, PRIMARY KEY (owner, target))'
    )


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
            (dm_room_id(viewer, target), target),
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

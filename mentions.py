"""@mentions in room messages.

People are written into a message's text as @username (the composer suggests them). When the
message is sent the server finds which of those name someone who can see the room, and stores
them in the message's meta as {"mentions": {username: screenname}}; clients show each as
@Screenname, and the people mentioned are told even if they muted the room. DMs have none.

A room's owner and admins can also write @everyone: the message is stored with
{"everyone": true} and counts as mentioning every member but the sender (not in the lobby,
which is everyone's).
"""

import re

from auth_session import dm_participants
from state import LOBBY, get_level

# @ at the start or after anything that isn't part of a name (so emails don't count)
MENTION_RE = re.compile(r'(?<![A-Za-z0-9_@.])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])')
MAX_PER_MESSAGE = 20
EVERYONE = 'everyone'  # a reserved username (see moderation.RESERVED_USERNAMES)


def candidates(text: str) -> list[str]:
    """Usernames written as @name in `text`, lowercased, first appearance first."""
    seen = []
    for match in MENTION_RE.finditer(text or ''):
        name = match.group(1).lower()
        if name not in seen:
            seen.append(name)
    return seen[:MAX_PER_MESSAGE]


def find(cur, room: str, text: str) -> dict[str, str]:
    """{username: screenname} for each @name in `text` that is someone in `room`."""
    names = [n for n in candidates(text) if n != EVERYONE]
    if not names or dm_participants(room) is not None:
        return {}
    cur.execute('SELECT members, kicked FROM rooms WHERE name = %s', (room,))
    row = cur.fetchone()
    if not row:
        return {}
    kicked = set(row['kicked'] or [])
    inside = None if room == LOBBY else set(row['members'] or [])  # the lobby is everyone's
    cur.execute('SELECT username, screenname FROM users WHERE username = ANY(%s)', (names,))
    found = {r['username']: r['screenname'] for r in cur.fetchall()}
    return {
        name: found[name]
        for name in names
        if name in found and name not in kicked and (inside is None or name in inside)
    }


def everyone(cur, room: str, text: str, sender: str) -> bool:
    """Does `text` @mention everyone in `room`, and may `sender` do that?"""
    if EVERYONE not in candidates(text) or room == LOBBY or dm_participants(room) is not None:
        return False
    cur.execute('SELECT owner, admins FROM rooms WHERE name = %s', (room,))
    row = cur.fetchone()
    return bool(row) and get_level(sender, row) >= 1


def meta_for(cur, room: str, text: str, sender: str) -> dict:
    """The mention part of a message's meta: {"mentions": {...}, "everyone": True}, either or none."""
    meta = {}
    mentioned = find(cur, room, text)
    if mentioned:
        meta['mentions'] = mentioned
    if everyone(cur, room, text, sender):
        meta['everyone'] = True
    return meta

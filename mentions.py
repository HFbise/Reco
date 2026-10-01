"""@mentions in room messages.

People are written into a message's text as @username (the composer suggests them). When the
message is sent the server finds which of those name someone who can see the room, and stores
them in the message's meta as {"mentions": {username: screenname}}; clients show each as
@Screenname, and the people mentioned are told even if they muted the room. DMs have none.
"""

import re

from auth_session import dm_participants
from state import LOBBY

# @ at the start or after anything that isn't part of a name (so emails don't count)
MENTION_RE = re.compile(r'(?<![A-Za-z0-9_@.])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])')
MAX_PER_MESSAGE = 20


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
    names = candidates(text)
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

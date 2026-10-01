"""Rooms: who may get in, and what a room shows of its members.

Getting in (`admit`), checked in this order:
  - kicked: never (until an admin lets them back in);
  - invite-only rooms: members, the owner and admins, and people holding an invite;
  - password rooms: the same people without the password, everyone else with it.
An invite is used up by the join it lets through.
"""

import random
import string

from auth_session import dm_participants
from state import LOBBY, appears_online, get_level
from utils import hash_password, verify_password

CODE_DIGITS = 6
MAX_NAME_LEN = 32


def new_code(cur) -> str:
    """A room code nobody else has: what people type to find the room."""
    while True:
        code = ''.join(random.choices(string.digits, k=CODE_DIGITS))
        cur.execute('SELECT 1 FROM rooms WHERE code = %s', (code,))
        if not cur.fetchone():
            return code


def valid_name(name: str) -> bool:
    # 'dm:' is reserved for direct-message rooms
    return bool(name) and len(name) <= MAX_NAME_LEN and not name.lower().startswith('dm:')


def _inside(username: str, row: dict) -> bool:
    """Already a member, or the room's owner or an admin."""
    return username in (row.get('members') or []) or get_level(username, row) > 0


def needs_password(username: str, row: dict, invited: bool = False) -> bool:
    return bool(row.get('password')) and not invited and not _inside(username, row)


def invite_only_for(username: str, row: dict) -> bool:
    return bool(row.get('invite_only')) and not _inside(username, row)


def has_invite(cur, room: str, username: str) -> bool:
    cur.execute('SELECT 1 FROM room_invites WHERE room = %s AND username = %s', (room, username))
    return cur.fetchone() is not None


def _use_invite(cur, room: str, username: str):
    cur.execute('DELETE FROM room_invites WHERE room = %s AND username = %s', (room, username))


def admit(cur, username: str, row: dict, password: str) -> str | None:
    """None if `username` may come in (using up an invite if that's what let them), else the
    reason they may not: kicked_from_room, invite_only or wrong_password. The caller commits."""
    room = row['name']
    if username in (row.get('kicked') or []):
        return 'kicked_from_room'
    if invite_only_for(username, row):
        if not has_invite(cur, room, username):
            return 'invite_only'
        _use_invite(cur, room, username)
        return None
    if needs_password(username, row):
        if has_invite(cur, room, username):
            _use_invite(cur, room, username)
            return None
        ok, legacy = verify_password(row['password'], password)
        if not ok:
            return 'wrong_password'
        if legacy:  # stored in plain text by an old version: hash it now that we have it
            cur.execute('UPDATE rooms SET password = %s WHERE name = %s', (hash_password(password), room))
    return None


def members_view(cur, row: dict) -> list[dict]:
    """The member list as clients show it: online first, then by name."""
    usernames = list(row.get('members') or [])
    profiles = {}
    if usernames:
        cur.execute(
            'SELECT username, screenname, avatar_expression, avatar_color FROM users WHERE username = ANY(%s)',
            (usernames,),
        )
        profiles = {r['username']: r for r in cur.fetchall()}
    admins = set(row.get('admins') or [])
    owner = row.get('owner') or ''
    members = [
        {
            'username': u,
            'screenname': profiles.get(u, {}).get('screenname', u),
            'is_admin': u in admins,
            'is_owner': u == owner,
            'is_online': appears_online(u),
            'avatar_expression': profiles.get(u, {}).get('avatar_expression') or 'Smile',
            'avatar_color': profiles.get(u, {}).get('avatar_color') or '#5865F2',
        }
        for u in usernames
    ]
    members.sort(key=lambda m: (not m['is_online'], m['screenname']))
    return members


def can_see(cur, username: str, room: str) -> bool:
    """A DM's two people; a room's members (everyone, for the lobby), unless kicked."""
    participants = dm_participants(room)
    if participants is not None:
        return username in participants
    cur.execute('SELECT members, kicked FROM rooms WHERE name = %s', (room,))
    row = cur.fetchone()
    if not row or username in (row['kicked'] or []):
        return False
    return room == LOBBY or username in (row['members'] or [])

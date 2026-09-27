"""Read-only demo shown to visitors who haven't signed up.

Guests only ever see DEMO_ROOM, which holds a scripted conversation between
three demo accounts. The real lobby (friends' actual chats) is never exposed.
Nobody can post in DEMO_ROOM, so the demo can't be defaced.

Bump DEMO_VERSION after editing the script: the next startup replaces the
room's messages with the new version.
"""

import json
import logging
import secrets

from utils import hash_password

log = logging.getLogger(__name__)

DEMO_ROOM = 'Reco Demo'
DEMO_VERSION = 1

# username: (screenname, avatar expression, avatar color)
PERSONAS = {
    'demo_maya': ('Maya', 'Smile', '#EB459E'),
    'demo_leo': ('Leo', 'Laugh', '#0099E1'),
    'demo_sam': ('Sam', 'BigLaugh', '#3BA55C'),
}

# (minutes ago, author, text, extras) — 'system' rows use a system-message code
SCRIPT = [
    (1500, 'system', 'user_joined', {'name': 'Maya'}),
    (1498, 'demo_maya', 'Hey! Welcome to the Reco demo 👋', {'reactions': {'👋': ['demo_leo', 'demo_sam']}}),
    (1495, 'demo_leo', 'This room is a read-only preview. Sign up to create rooms, DM people or hop into voice.', {}),
    (1490, 'demo_sam', 'Messages update live over WebSockets: reactions, edits and unsend included.', {'edited': True}),
    (1488, 'demo_maya', 'Rooms can be private with a password, and owners can promote admins, mute or kick.', {}),
    (30, 'system', 'user_joined', {'name': 'Leo'}),
    (
        28,
        'demo_leo',
        'Voice chat runs peer-to-peer over WebRTC, relayed through our TURN server when needed.',
        {'reactions': {'🔥': ['demo_maya']}},
    ),
    (25, 'demo_sam', 'And the Match tab pairs you with a random stranger who shares your interests.', {}),
    (
        20,
        'demo_maya',
        'The whole UI works in English and Chinese, try switching the language in settings 🌏',
        {'reactions': {'👍': ['demo_leo', 'demo_sam']}},
    ),
]


def seed(cur):
    """Create or refresh the demo room. Idempotent; called from _migrate()."""
    cur.execute('SELECT username FROM users WHERE username = ANY(%s)', (list(PERSONAS),))
    existing = {r['username'] for r in cur.fetchall()}
    for username, (screenname, expression, color) in PERSONAS.items():
        if username in existing:
            continue  # hashing is deliberately slow; don't redo it on every startup
        # Unusable random password: these accounts exist only to author the demo
        cur.execute(
            'INSERT INTO users (username, screenname, password, bio, avatar_expression, avatar_color)'
            " VALUES (%s, %s, %s, 'Demo account', %s, %s) ON CONFLICT (username) DO NOTHING",
            (username, screenname, hash_password(secrets.token_urlsafe(32)), expression, color),
        )

    cur.execute(
        'INSERT INTO rooms (name, admins, members, owner, code) VALUES (%s, %s, %s, NULL, NULL)'
        ' ON CONFLICT (name) DO UPDATE SET members = EXCLUDED.members, owner = NULL, code = NULL',
        (DEMO_ROOM, [], list(PERSONAS)),
    )

    cur.execute(
        "SELECT 1 FROM messages WHERE room = %s AND meta->>'demo_version' = %s LIMIT 1",
        (DEMO_ROOM, str(DEMO_VERSION)),
    )
    if cur.fetchone():
        return
    cur.execute('DELETE FROM messages WHERE room = %s', (DEMO_ROOM,))
    for minutes_ago, author, text, extras in SCRIPT:
        if author == 'system':
            code, params = text, extras
            cur.execute(
                'INSERT INTO messages (room, username, screenname, text, system, meta, created_at)'
                " VALUES (%s, 'system', '系统', %s, TRUE, %s::jsonb, NOW() - make_interval(mins => %s))",
                (
                    DEMO_ROOM,
                    f'{params["name"]} 加入了房间',
                    json.dumps({'system': {'code': code, 'params': params}, 'demo_version': DEMO_VERSION}),
                    minutes_ago,
                ),
            )
            continue
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text, edited, reactions, meta, created_at)'
            ' VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, NOW() - make_interval(mins => %s))',
            (
                DEMO_ROOM,
                author,
                PERSONAS[author][0],
                text,
                bool(extras.get('edited')),
                json.dumps(extras.get('reactions', {})),
                json.dumps({'demo_version': DEMO_VERSION}),
                minutes_ago,
            ),
        )
    log.info('seeded demo room (version %d)', DEMO_VERSION)

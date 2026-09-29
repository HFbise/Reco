"""Photos in chats.

Kept in Postgres (BYTEA) rather than object storage: no extra service or credentials, and
at portfolio scale it's plenty. Browsers shrink photos to ~1600 px before upload, and the
server takes at most MAX_BYTES. At real scale these would move to object storage + a CDN
(see the README's trade-offs).

An upload is private until its owner sends it in a message; from then on anyone with the
link (the id is 128 random bits) can load it, the way chat apps serve attachments. Recalling
the message takes the image down.
"""

import secrets
import struct
import time

from flask import Blueprint, jsonify, request

from auth_session import is_guest, verify_token
from db import get_db

bp = Blueprint('images', __name__)

MAX_BYTES = 2 * 1024 * 1024
MAX_SIDE = 10_000
UPLOADS_PER_MINUTE = 10
_recent_uploads: dict[str, list[float]] = {}

CREATE = """CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, mime TEXT NOT NULL, data BYTEA NOT NULL,
    width INTEGER NOT NULL, height INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    message_id INTEGER, room TEXT)"""


def migrate(cur):
    cur.execute(CREATE)
    cur.execute('CREATE INDEX IF NOT EXISTS images_message_idx ON images(message_id)')


def sniff(data: bytes) -> tuple[str, int, int] | None:
    """(mime, width, height) read from the file itself; None if it isn't a JPEG/PNG/GIF/WebP we can size."""
    try:
        if data[:8] == b'\x89PNG\r\n\x1a\n' and data[12:16] == b'IHDR':
            w, h = struct.unpack('>II', data[16:24])
            return 'image/png', w, h
        if data[:6] in (b'GIF87a', b'GIF89a'):
            w, h = struct.unpack('<HH', data[6:10])
            return 'image/gif', w, h
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            chunk = data[12:16]
            if chunk == b'VP8 ':
                w, h = struct.unpack('<HH', data[26:30])
                return 'image/webp', w & 0x3FFF, h & 0x3FFF
            if chunk == b'VP8L':
                b = data[21:25]
                w = 1 + (((b[1] & 0x3F) << 8) | b[0])
                h = 1 + (((b[3] & 0x0F) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
                return 'image/webp', w, h
            if chunk == b'VP8X':
                w = 1 + int.from_bytes(data[24:27], 'little')
                h = 1 + int.from_bytes(data[27:30], 'little')
                return 'image/webp', w, h
            return None
        if data[:2] == b'\xff\xd8':
            i = 2
            while i + 9 < len(data):
                if data[i] != 0xFF:
                    return None
                marker = data[i + 1]
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                length = struct.unpack('>H', data[i + 2 : i + 4])[0]
                # Start-of-frame markers carry the size (not DHT C4, JPG C8, DAC CC)
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack('>HH', data[i + 5 : i + 9])
                    return 'image/jpeg', w, h
                i += 2 + length
    except (struct.error, IndexError):
        return None
    return None


def _user():
    auth = request.headers.get('Authorization', '')
    username = verify_token(auth[7:] if auth.startswith('Bearer ') else '')
    return None if not username or is_guest(username) else username


def _rate_ok(username: str) -> bool:
    now = time.monotonic()
    recent = [t for t in _recent_uploads.get(username, []) if now - t < 60]
    if len(recent) >= UPLOADS_PER_MINUTE:
        _recent_uploads[username] = recent
        return False
    _recent_uploads[username] = [*recent, now]
    return True


@bp.route('/api/images', methods=['POST'])
def upload():
    username = _user()
    if not username:
        return jsonify({'error': 'auth_required'}), 401
    if (request.content_length or 0) > MAX_BYTES:
        return jsonify({'error': 'image_too_big'}), 413
    data = request.get_data(cache=False)
    if not data or len(data) > MAX_BYTES:
        return jsonify({'error': 'image_too_big' if data else 'no_image'}), 413 if data else 400
    found = sniff(data)
    if not found or not (0 < found[1] <= MAX_SIDE and 0 < found[2] <= MAX_SIDE):
        return jsonify({'error': 'not_an_image'}), 415
    if not _rate_ok(username):
        return jsonify({'error': 'rate_limited'}), 429
    mime, width, height = found
    image_id = secrets.token_hex(16)
    with get_db() as conn:
        conn.cursor().execute(
            'INSERT INTO images (id, owner, mime, data, width, height) VALUES (%s, %s, %s, %s, %s, %s)',
            (image_id, username, mime, data, width, height),
        )
        conn.commit()
    return jsonify({'id': image_id, 'width': width, 'height': height})


@bp.route('/img/<image_id>')
def serve(image_id):
    if len(image_id) != 32 or not all(ch in '0123456789abcdef' for ch in image_id):
        return '', 404
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT i.mime, i.data FROM images i JOIN messages m ON m.id = i.message_id'
            ' WHERE i.id = %s AND NOT COALESCE(m.recalled, FALSE)',
            (image_id,),
        )
        row = cur.fetchone()
    if not row:
        return '', 404
    return (
        bytes(row['data']),
        200,
        {
            'Content-Type': row['mime'],
            'Cache-Control': 'private, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
        },
    )


def attach(cur, image_id, username: str, room: str) -> dict | None:
    """Claim an upload for a message being sent: it must be the sender's and not used yet.
    Returns the message's image info, or None if the id isn't usable."""
    if not isinstance(image_id, str) or len(image_id) != 32:
        return None
    cur.execute(
        'SELECT id, width, height FROM images WHERE id = %s AND owner = %s AND message_id IS NULL FOR UPDATE',
        (image_id, username),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {'id': row['id'], 'w': row['width'], 'h': row['height']}


def link(cur, image_id: str, message_id: int, room: str):
    cur.execute('UPDATE images SET message_id = %s, room = %s WHERE id = %s', (message_id, room, image_id))

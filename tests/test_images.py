"""Photos: what the server accepts, who may send an upload, and who can see it."""

import struct
import zlib

import pytest
from conftest import app, connect_as, create_room, create_user, events, get_db, login, query

import images


def png(w=3, h=2):
    """A real (tiny) PNG."""

    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))

    raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )


JPEG = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
    + b'\xff\xc0\x00\x11\x08\x00\x40\x00\x80\x03'
)
GIF = b'GIF89a' + struct.pack('<HH', 5, 7) + b'\x00' * 10
WEBP = b'RIFF\x00\x00\x00\x00WEBPVP8X' + b'\x00' * 8 + (9).to_bytes(3, 'little') + (4).to_bytes(3, 'little')


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    images._recent_uploads.clear()


def test_the_server_reads_type_and_size_from_the_file_itself():
    assert images.sniff(png(3, 2)) == ('image/png', 3, 2)
    assert images.sniff(JPEG) == ('image/jpeg', 128, 64)
    assert images.sniff(GIF) == ('image/gif', 5, 7)
    assert images.sniff(WEBP) == ('image/webp', 10, 5)
    assert images.sniff(b'<svg xmlns="http://www.w3.org/2000/svg"/>') is None
    assert images.sniff(b'\x89PNG\r\n\x1a\n') is None  # truncated


def upload(token, body, content_type='image/png'):
    return app.test_client().post(
        '/api/images', data=body, headers={'Authorization': f'Bearer {token}', 'Content-Type': content_type}
    )


def test_uploads_need_an_account_and_a_real_small_image():
    create_user('alice')
    _, token = login('alice')
    assert upload('nope', png()).status_code == 401
    guest = app.test_client()
    assert guest.post('/api/images', data=png()).status_code == 401
    assert upload(token, b'not an image at all').status_code == 415
    assert upload(token, png() + b'\x00' * images.MAX_BYTES).status_code == 413
    ok = upload(token, png(3, 2))
    assert ok.status_code == 200 and ok.get_json()['width'] == 3


def test_demo_guests_cannot_upload():
    guest = app.test_client()
    from conftest import anon_client

    sock = anon_client()
    sock.emit('guest_login', {})
    token = events(sock, 'guest_login_result')[0]['token']
    res = guest.post('/api/images', data=png(), headers={'Authorization': f'Bearer {token}'})
    assert res.status_code == 401


def test_uploads_are_rate_limited():
    create_user('alice')
    _, token = login('alice')
    codes = [upload(token, png()).status_code for _ in range(images.UPLOADS_PER_MINUTE + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}


def joined(username, room):
    client = connect_as(username)
    client.emit('join', {'room': room})
    client.get_received()
    return client


def test_a_photo_message_reaches_the_room_and_the_image_can_be_loaded():
    create_user('alice')
    create_user('bob')
    create_room('club', owner='alice', members=['alice', 'bob'])
    _, token = login('alice')
    image_id = upload(token, png(3, 2)).get_json()['id']
    assert app.test_client().get(f'/img/{image_id}').status_code == 404  # not sent yet: private

    alice, bob = joined('alice', 'club'), joined('bob', 'club')
    alice.emit('message', {'room': 'club', 'text': '', 'image': image_id})
    got = events(bob, 'message')[0]
    assert got['meta'] == {'image': {'id': image_id, 'w': 3, 'h': 2}} and got['text'] == ''
    res = app.test_client().get(f'/img/{image_id}')
    assert res.status_code == 200 and res.content_type == 'image/png'
    assert res.headers['X-Content-Type-Options'] == 'nosniff'

    # History carries it too; recalling the message takes the image down
    alice.emit('recall_message', {'id': got['id']})
    assert app.test_client().get(f'/img/{image_id}').status_code == 404
    assert query('SELECT id FROM images') == []  # and it isn't kept


def test_you_cannot_send_someone_elses_upload_or_reuse_one():
    create_user('alice')
    create_user('mallory')
    create_room('club', owner='alice', members=['alice', 'mallory'])
    _, token = login('alice')
    image_id = upload(token, png()).get_json()['id']
    mallory, alice = joined('mallory', 'club'), joined('alice', 'club')

    mallory.emit('message', {'room': 'club', 'text': '', 'image': image_id})
    assert events(alice, 'message') == []  # nothing sent: not her photo, and no text
    mallory.emit('message', {'room': 'club', 'text': 'look', 'image': image_id})
    assert events(alice, 'message')[0]['meta'] is None  # the text goes, the photo doesn't

    alice.emit('message', {'room': 'club', 'text': '', 'image': image_id})
    alice.emit('message', {'room': 'club', 'text': '', 'image': image_id})  # already used
    photos = [m for m in events(mallory, 'message') if m.get('meta')]
    assert len(photos) == 1


def test_image_ids_that_are_not_ids_are_simply_not_found():
    client = app.test_client()
    assert client.get('/img/' + 'z' * 32).status_code == 404
    assert client.get('/img/' + 'A' * 32).status_code == 404
    assert client.get('/img/short').status_code == 404


# ── space: nothing is kept that can't be seen ─────────────────


def test_closing_a_room_deletes_its_photos():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    _, token = login('alice')
    image_id = upload(token, png()).get_json()['id']
    alice = joined('alice', 'club')
    alice.emit('message', {'room': 'club', 'text': '', 'image': image_id})
    assert query('SELECT id FROM images') == [{'id': image_id}]
    alice.emit('close_room', {'room': 'club'})
    assert events(alice, 'close_room_result')[0]['success']
    assert query('SELECT id FROM images') == []


def test_purge_clears_unsent_uploads_and_photos_of_gone_messages():
    create_user('alice')
    create_room('club', owner='alice', members=['alice'])
    _, token = login('alice')
    shown, fresh, stale, orphan = (upload(token, png()).get_json()['id'] for _ in range(4))
    alice = joined('alice', 'club')
    for image_id in (shown, orphan):
        alice.emit('message', {'room': 'club', 'text': '', 'image': image_id})
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE images SET created_at = NOW() - INTERVAL '2 hours' WHERE id = %s", (stale,))
        cur.execute('DELETE FROM messages WHERE id = (SELECT message_id FROM images WHERE id = %s)', (orphan,))
        assert images.purge(cur) == 2
        conn.commit()
    assert sorted(r['id'] for r in query('SELECT id FROM images')) == sorted([shown, fresh])


def test_the_admin_dashboard_shows_photo_storage():
    create_user('alice')
    _, token = login('alice')
    upload(token, png())
    web = app.test_client()
    web.post('/admin/login', data={'password': 'test-admin'})
    page = web.get('/admin/dashboard').get_data(as_text=True)
    assert f'{len(png())} B</div><div class="stat-label">图片占用' in page

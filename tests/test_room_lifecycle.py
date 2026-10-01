"""Rooms end to end over the socket (create, find, join, leave, list, members), plus the
access rules in room_access.py and the people events (report, block, unblock)."""

import pytest
from conftest import anon_client, connect_as, create_room, create_user, events, get_db, query

import room_access


def join(client, room, **extra):
    client.emit('join', {'room': room, 'skip_history': True, **extra})
    return events(client, 'join_result')[0]


def row(name):
    return query('SELECT * FROM rooms WHERE name = %s', name)[0]


# ── room_access ───────────────────────────────────────────────


@pytest.mark.parametrize(
    'name, ok',
    [
        ('book club', True),
        ('', False),
        ('x' * 33, False),
        ('dm:alice:bob', False),
        ('DM:sneaky', False),
        ('读书会', True),
    ],
)
def test_room_names(name, ok):
    assert room_access.valid_name(name) is ok


def test_who_needs_the_password_and_who_is_turned_away():
    for u in ('owner', 'mod', 'member', 'stranger'):
        create_user(u)
    create_room('vault', 'owner', members=['mod', 'member'], admins=['mod'], password='pw')
    vault = row('vault')
    assert [u for u in ('owner', 'mod', 'member', 'stranger') if room_access.needs_password(u, vault)] == ['stranger']
    assert not room_access.needs_password('stranger', vault, invited=True)
    with get_db() as conn:
        cur = conn.cursor()
        assert room_access.admit(cur, 'stranger', vault, 'nope') == 'wrong_password'
        assert room_access.admit(cur, 'stranger', vault, 'pw') is None
        cur.execute("UPDATE rooms SET kicked = ARRAY['stranger'] WHERE name = 'vault'")
        conn.commit()
        assert room_access.admit(cur, 'stranger', row('vault'), 'pw') == 'kicked_from_room'


def test_an_invite_gets_you_in_once():
    create_user('owner')
    create_user('pal')
    create_room('club', 'owner', members=['owner'])
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE rooms SET invite_only = TRUE WHERE name = 'club'")
        cur.execute("INSERT INTO room_invites (room, username, invited_by) VALUES ('club', 'pal', 'owner')")
        conn.commit()
        club = row('club')
        assert room_access.invite_only_for('pal', club)
        assert room_access.admit(cur, 'pal', club, '') is None  # uses the invite up
        assert room_access.admit(cur, 'pal', club, '') == 'invite_only'


def test_a_legacy_plain_text_room_password_is_hashed_on_first_use():
    create_user('owner')
    create_user('guest')
    create_room('old', 'owner', members=['owner'])
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE rooms SET password = 'plain' WHERE name = 'old'")
        conn.commit()
    assert join(connect_as('guest'), 'old', password='plain')['success']
    assert row('old')['password'].startswith(('scrypt:', 'pbkdf2:'))


def test_room_codes_are_six_digits_and_unique():
    with get_db() as conn:
        cur = conn.cursor()
        codes = {room_access.new_code(cur) for _ in range(20)}
    assert all(len(c) == 6 and c.isdigit() for c in codes)


# ── over the socket ───────────────────────────────────────────


def test_create_then_find_by_code_then_join():
    create_user('ann')
    create_user('ben')
    ann, ben = connect_as('ann'), connect_as('ben')
    ann.emit('create_room', {'room': 'chess', 'password': ''})
    created = events(ann, 'create_room_result')[0]
    assert created['success'] and len(created['code']) == 6
    ann.emit('create_room', {'room': 'chess'})
    assert events(ann, 'create_room_result')[0]['code'] == 'room_exists'

    ben.emit('find_room', {'code': created['code']})
    found = events(ben, 'find_room_result')[0]
    assert found['room'] == 'chess' and found['needs_password'] is False
    result = join(ben, 'chess')
    assert result['success'] and result['is_first_join'] and result['my_level'] == 0
    assert [m['username'] for m in result['members']] == ['ben']  # online first; ann's creation didn't join her


def test_a_new_member_is_announced_once():
    create_user('ann')
    create_room('chess', 'ann', members=['ann'])
    ann = connect_as('ann')
    join(ann, 'chess')
    create_user('ben')
    ben = connect_as('ben')
    join(ben, 'chess')
    join(ben, 'chess')
    joined = [m for m in events(ann, 'message') if m.get('system')]
    assert [m['meta']['system']['code'] for m in joined] == ['user_joined']


def test_leaving_a_room_takes_you_off_the_list_and_tells_the_room():
    create_user('ann')
    create_user('ben')
    create_room('chess', 'ann', members=['ann', 'ben'], admins=['ben'])
    ann, ben = connect_as('ann'), connect_as('ben')
    join(ann, 'chess')
    join(ben, 'chess')
    ben.emit('leave_room', {'room': 'chess'})
    assert events(ben, 'leave_room_result')[0]['success']
    assert row('chess')['members'] == ['ann'] and row('chess')['admins'] == []
    left = [m for m in events(ann, 'message') if m.get('system')]
    assert left[-1]['meta']['system']['code'] == 'user_left'
    ben.emit('get_rooms', {})
    assert 'chess' not in [r['name'] for r in events(ben, 'rooms_list')[0]['rooms']]


def test_nobody_leaves_the_lobby():
    create_user('ann')
    ann = connect_as('ann')
    ann.emit('leave_room', {'room': '大厅'})
    assert events(ann, 'leave_room_result')[0]['code'] == 'cannot_leave_lobby'


def test_the_room_list_puts_the_lobby_first():
    create_user('ann')
    create_room('aardvarks', 'ann', members=['ann'])
    ann = connect_as('ann')
    ann.emit('get_rooms', {})
    assert [r['name'] for r in events(ann, 'rooms_list')[0]['rooms']] == ['大厅', 'aardvarks']


def test_members_are_listed_only_for_a_room_you_are_in():
    create_user('ann')
    create_user('eve')
    create_room('chess', 'ann', members=['ann'])
    ann, eve = connect_as('ann'), connect_as('eve')
    join(ann, 'chess')
    ann.emit('get_members', {'room': 'chess'})
    assert [m['username'] for m in events(ann, 'members_list')[0]['members']] == ['ann']
    eve.emit('get_members', {'room': 'chess'})
    assert events(eve, 'members_list')[0]['members'] == []


def test_a_guest_can_only_join_the_demo_room():
    guest = anon_client()
    guest.emit('guest_login', {})
    assert join(guest, '大厅')['code'] == 'guest_read_only'


# ── people ────────────────────────────────────────────────────


def test_report_block_and_unblock():
    create_user('ann')
    create_user('troll')
    ann = connect_as('ann')
    ann.emit('report_user', {'reported': 'troll', 'reason': 'spam ' * 200})
    assert events(ann, 'report_result')[0]['success']
    assert len(query('SELECT reason FROM reports')[0]['reason']) == 500
    ann.emit('report_user', {'reported': 'ann'})  # yourself: ignored
    assert len(query('SELECT * FROM reports')) == 1

    ann.emit('block_user', {'blocked': 'troll'})
    ann.emit('get_blocked_users', {})
    assert events(ann, 'blocked_users_list')[0]['users'] == ['troll']
    ann.emit('unblock_user', {'blocked': 'troll'})
    assert events(ann, 'unblock_result')[0] == {'success': True, 'unblocked': 'troll'}
    assert query('SELECT * FROM blocks') == []


# ── voice after a reconnect ───────────────────────────────────


def test_a_member_can_rejoin_voice_before_rejoining_the_room():
    """After a reconnect the client asks to rejoin voice and the room at once, in either order
    (and on a phone voice can outlive the chat screen). A member gets in either way."""
    import state

    create_user('ann')
    create_user('eve')
    create_room('chess', 'ann', members=['ann'])
    ann, eve = connect_as('ann'), connect_as('eve')
    ann.emit('voice_join', {'room': 'chess'})  # this socket never sent 'join'
    assert [m['username'] for m in events(ann, 'voice_current_members')[0]['members']] == ['ann']
    eve.emit('voice_join', {'room': 'chess'})  # not a member
    assert not events(eve, 'voice_current_members')
    assert [m['username'] for m in state.rooms_voice['chess']['voice_members']] == ['ann']
    eve.emit('voice_join', {'room': 'dm:ann:eve'})  # DMs have no voice
    assert 'dm:ann:eve' not in state.rooms_voice


def test_someone_joining_voice_sees_who_is_already_talking_or_muted():
    """Speaking and mute are announced when they change: a later arrival gets them in the list."""
    create_user('ann')
    create_user('bob')
    create_room('chess', 'ann', members=['ann', 'bob'])
    ann, bob = connect_as('ann'), connect_as('bob')
    ann.emit('voice_join', {'room': 'chess'})
    ann.emit('voice_speaking', {'room': 'chess', 'speaking': True})
    ann.emit('voice_mute_status', {'room': 'chess', 'muted': True})
    bob.emit('voice_join', {'room': 'chess'})
    [ann_seen] = [m for m in events(bob, 'voice_current_members')[0]['members'] if m['username'] == 'ann']
    assert ann_seen['isSpeaking'] is True and ann_seen['isMuted'] is True

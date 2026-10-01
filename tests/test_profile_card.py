"""People's cards: what's on them for whom, last seen, shared rooms, nicknames."""

from conftest import anon_client, connect_as, create_room, create_user, events, get_db, query

import moderation


def card(client, username, room=None):
    client.emit('get_profile_card', {'username': username, **({'room': room} if room else {})})
    return events(client, 'profile_card')[-1]


def join(client, room):
    client.emit('join', {'room': room, 'skip_history': True})
    assert events(client, 'join_result')[0]['success']


def test_a_card_shows_who_they_are_and_when_they_signed_up():
    create_user('alice')
    create_user('bob', screenname='Bobby')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET bio = 'likes chess' WHERE username = 'bob'")
        cur.execute("UPDATE users SET created_at = NULL WHERE username = 'alice'")  # from before it was kept
        conn.commit()
    alice = connect_as('alice')
    bob = card(alice, 'bob')
    assert (bob['screenname'], bob['bio']) == ('Bobby', 'likes chess')
    assert bob['created_at'] is not None
    assert card(alice, 'alice')['created_at'] is None
    assert card(alice, 'nobody') == {'success': False, 'code': 'user_not_found', 'params': {}, 'username': 'nobody'}


def test_shared_rooms_leave_out_the_lobby_and_rooms_only_one_is_in():
    for u in ('alice', 'bob'):
        create_user(u)
    create_room('chess', 'alice', members=['alice', 'bob'])
    create_room('art', 'bob', members=['bob'])
    create_room('band', 'alice', members=['alice', 'bob'])
    alice = connect_as('alice')
    assert card(alice, 'bob')['mutual_rooms'] == ['band', 'chess']


def test_last_seen_is_when_they_were_last_visibly_online():
    for u in ('alice', 'bob'):
        create_user(u)
    alice = connect_as('alice')
    bob = connect_as('bob')
    assert card(alice, 'bob')['online'] is True
    bob.disconnect()
    seen = card(alice, 'bob')
    assert seen['online'] is False and seen['last_seen'] is not None


def test_hiding_your_status_hides_when_you_were_on_except_from_whoever_you_write_to():
    for u in ('alice', 'bob', 'carol'):
        create_user(u)
    with get_db() as conn:
        conn.cursor().execute("UPDATE users SET show_online = FALSE WHERE username = 'bob'")
        conn.commit()
    bob = connect_as('bob')
    alice, carol = connect_as('alice'), connect_as('carol')
    assert card(alice, 'bob')['online'] is False
    assert card(alice, 'bob')['last_seen'] is None
    bob.emit('join_dm', {'dm_room': 'dm:alice:bob'})
    bob.emit('message', {'room': 'dm:alice:bob', 'text': 'psst'})
    [sent] = query("SELECT created_at FROM messages WHERE username = 'bob'")
    assert card(alice, 'bob')['last_seen'] == sent['created_at'].isoformat()
    assert card(carol, 'bob')['last_seen'] is None  # carol never heard from him


def test_in_a_room_moderators_see_mutes_and_everyone_sees_rank_and_voice():
    for u in ('alice', 'bob', 'carol'):
        create_user(u)
    create_room('chess', 'alice', members=['alice', 'bob', 'carol'], admins=['bob'])
    alice, carol = connect_as('alice'), connect_as('carol')
    join(alice, 'chess')
    join(carol, 'chess')
    moderation.restrict('chess', 'carol', moderation.TEXT, 600)
    carol.emit('voice_join', {'room': 'chess'})
    seen = card(alice, 'carol', 'chess')['room']
    assert seen['in_voice'] and seen['muted'] and seen['muted_until'] and not seen['voice_banned']
    assert seen['my_level'] == 2 and seen['level'] == 0
    assert card(alice, 'bob', 'chess')['room']['level'] == 1
    peer = card(carol, 'carol', 'chess')['room']
    assert peer['muted'] is False and peer['my_level'] == 0  # not a moderator: no mutes shown
    # A room this socket isn't in gives no room part
    create_room('secret', 'bob', members=['bob'])
    assert card(alice, 'bob', 'secret')['room'] is None


def test_nicknames_are_yours_and_reach_every_device():
    for u in ('alice', 'bob'):
        create_user(u)
    phone, laptop = connect_as('alice'), connect_as('alice')
    phone.emit('set_nickname', {'username': 'bob', 'nickname': '  Bobby from work  '})
    assert events(laptop, 'nicknames')[-1] == {'nicknames': {'bob': 'Bobby from work'}}
    assert card(phone, 'bob')['nickname'] == 'Bobby from work'
    assert card(connect_as('bob'), 'alice')['nickname'] == ''  # his side has none
    phone.emit('set_nickname', {'username': 'bob', 'nickname': ''})
    assert events(laptop, 'nicknames')[-1] == {'nicknames': {}}
    phone.emit('set_nickname', {'username': 'ghost', 'nickname': 'x'})
    assert events(phone, 'nickname_result')[-1]['code'] == 'user_not_found'
    assert query('SELECT * FROM user_nicknames') == []


def test_guests_see_the_basics_only():
    create_user('bob')
    guest = anon_client()
    guest.emit('guest_login', {})
    seen = card(guest, 'bob')
    assert seen['username'] == 'bob' and seen['mutual_rooms'] == [] and seen['last_seen'] is None

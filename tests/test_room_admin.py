"""Room settings for owners and admins: description, announcement, join mode, bans, log."""

from conftest import connect_as, create_room, create_user, events, query


def join(client, room, **extra):
    client.emit('join', {'room': room, 'skip_history': True, **extra})
    return events(client, 'join_result')[0]


def club(*members, admins=()):
    """A room 'club' owned by the first member, everyone signed in and inside it."""
    for m in members:
        create_user(m, screenname=m.title())
    create_room('club', members[0], members=list(members), admins=list(admins))
    clients = [connect_as(m) for m in members]
    for c in clients:
        join(c, 'club')
    return clients


# ── description and announcement ──────────────────────────────


def test_admins_edit_the_description_and_announcement_and_everyone_sees_it():
    owner, mod, member = club('olive', 'mo', 'mel', admins=['mo'])
    mod.emit('update_room_info', {'room': 'club', 'description': 'Books, monthly', 'announcement': 'Sunday 4pm'})
    assert events(mod, 'update_room_info_result')[0]['success']
    received = member.get_received()
    [seen] = [e['args'][0] for e in received if e['name'] == 'room_details']
    assert seen['description'] == 'Books, monthly'
    assert seen['announcement']['text'] == 'Sunday 4pm' and seen['announcement']['by'] == 'Mo'
    # A new announcement is also news in the chat
    [note] = [e['args'] for e in received if e['name'] == 'message' and e['args'].get('system')]
    assert note['meta']['system'] == {'code': 'announcement_updated', 'params': {'name': 'Mo'}}

    member.emit('update_room_info', {'room': 'club', 'announcement': 'hacked'})
    assert events(member, 'update_room_info_result')[0]['code'] == 'no_permission'
    member.emit('get_room_details', {'room': 'club'})
    assert events(member, 'room_details')[0]['announcement']['text'] == 'Sunday 4pm'


def test_an_empty_announcement_clears_it_and_long_text_is_refused():
    (owner,) = club('olive')
    owner.emit('update_room_info', {'room': 'club', 'announcement': 'x' * 1001})
    assert events(owner, 'update_room_info_result')[0]['code'] == 'text_too_long'
    owner.emit('update_room_info', {'room': 'club', 'announcement': 'soon'})
    owner.emit('update_room_info', {'room': 'club', 'announcement': '  '})
    assert events(owner, 'room_details')[-1]['announcement'] is None


# ── join mode ─────────────────────────────────────────────────


def test_an_invite_only_room_turns_away_strangers_but_lets_the_invited_in():
    owner, member = club('olive', 'mel')
    owner.emit('set_join_mode', {'room': 'club', 'mode': 'invite'})
    assert events(owner, 'set_join_mode_result')[0]['success']
    code = query("SELECT code FROM rooms WHERE name = 'club'")[0]['code']

    create_user('stan')
    stranger = connect_as('stan')
    stranger.emit('find_room', {'code': code})
    assert events(stranger, 'find_room_result')[0]['code'] == 'invite_only'
    assert join(stranger, 'club')['code'] == 'invite_only'
    assert join(member, 'club')['success']  # already a member

    member.emit('invite_to_room', {'room': 'club', 'target': 'stan'})
    assert events(member, 'invite_sent')[0]['success']
    assert join(stranger, 'club')['success']


def test_only_the_owner_sets_the_join_mode_and_a_password_mode_needs_one():
    owner, mod = club('olive', 'mo', admins=['mo'])
    mod.emit('set_join_mode', {'room': 'club', 'mode': 'open'})
    assert events(mod, 'set_join_mode_result')[0]['code'] == 'no_permission'
    owner.emit('set_join_mode', {'room': 'club', 'mode': 'password'})
    assert events(owner, 'set_join_mode_result')[0]['code'] == 'password_required'
    owner.emit('set_join_mode', {'room': 'club', 'mode': 'password', 'password': 'open sesame'})
    assert events(owner, 'room_details')[-1]['join_mode'] == 'password'
    create_user('stan')
    assert join(connect_as('stan'), 'club', password='open sesame')['success']
    owner.emit('set_join_mode', {'room': 'club', 'mode': 'open'})
    assert query("SELECT password, invite_only FROM rooms WHERE name = 'club'") == [
        {'password': None, 'invite_only': False}
    ]


# ── bans ──────────────────────────────────────────────────────


def test_the_ban_list_shows_kicks_and_mutes_and_a_kick_can_be_undone():
    owner, mod, troll, noisy = club('olive', 'mo', 'troll', 'noisy', admins=['mo'])
    mod.emit('kick_member', {'room': 'club', 'target': 'troll'})
    mod.emit('text_mute', {'room': 'club', 'target': 'noisy', 'duration_seconds': 600})
    mod.emit('voice_ban', {'room': 'club', 'target': 'noisy'})
    mod.emit('get_room_bans', {'room': 'club'})
    bans = events(mod, 'room_bans')[0]
    assert [p['screenname'] for p in bans['kicked']] == ['Troll']
    assert [p['username'] for p in bans['muted']] == ['noisy'] and bans['muted'][0]['until']
    assert bans['voice_banned'] == [{'username': 'noisy', 'screenname': 'Noisy', 'until': None}]

    noisy.emit('get_room_bans', {'room': 'club'})
    assert events(noisy, 'room_bans')[0]['code'] == 'no_permission'

    mod.emit('unkick_member', {'room': 'club', 'target': 'troll'})
    assert events(mod, 'unkick_result')[0]['success']
    assert join(troll, 'club')['success']


# ── the log ───────────────────────────────────────────────────


def test_moderation_steps_are_logged_newest_first_for_admins_only():
    owner, mod, troll, chatty = club('olive', 'mo', 'troll', 'chatty', admins=['mo'])
    chatty.emit('message', {'room': 'club', 'text': 'buy my stuff'})
    spam = events(chatty, 'message')[-1]['id']
    mod.emit('recall_message', {'id': spam})
    mod.emit('text_mute', {'room': 'club', 'target': 'chatty', 'duration_seconds': 60})
    mod.emit('kick_member', {'room': 'club', 'target': 'troll'})
    owner.emit('set_admin', {'room': 'club', 'target': 'chatty'})
    owner.emit('set_join_mode', {'room': 'club', 'mode': 'invite'})
    chatty.emit('recall_message', {'id': spam})  # own message, already gone: nothing to log

    owner.emit('get_room_log', {'room': 'club'})
    entries = events(owner, 'room_log')[0]['entries']
    assert [(e['actor'], e['action'], e['target']) for e in entries] == [
        ('olive', 'join_mode', None),
        ('olive', 'admin_add', 'chatty'),
        ('mo', 'kick', 'troll'),
        ('mo', 'mute', 'chatty'),
        ('mo', 'recall', 'chatty'),
    ]
    assert entries[0]['detail'] == {'mode': 'invite'}
    assert entries[3]['detail'] == {'duration': 60}
    assert entries[4]['detail'] == {'text': 'buy my stuff'} and entries[4]['actor_name'] == 'Mo'

    create_user('mel')
    outsider = connect_as('mel')
    outsider.emit('get_room_log', {'room': 'club'})
    assert events(outsider, 'room_log')[0]['code'] == 'no_permission'


def test_the_site_admin_panel_is_logged_too():
    from conftest import app

    club('olive', 'troll')
    http = app.test_client()
    http.post('/admin/login', data={'password': 'test-admin'})
    http.post('/admin/rooms/club/kick', data={'username': 'troll'})
    assert query("SELECT actor, action, target FROM room_log WHERE room = 'club'") == [
        {'actor': 'admin', 'action': 'kick', 'target': 'troll'}
    ]

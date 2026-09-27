"""Who gets paired with whom (pure queue logic, no sockets)."""

import pytest

from matching import RELAX_AFTER, TAGS, MatchQueue, Ticket, normalize_tags


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def ticket(user, tags=(), mode='text', last=None):
    return Ticket(username=user, sid=f'sid-{user}', mode=mode, tags=frozenset(tags), last_partner=last)


@pytest.fixture
def clock():
    return Clock()


def test_two_people_without_tags_are_paired_at_once(clock):
    q = MatchQueue(clock=clock)
    assert q.join(ticket('alice')) is None
    assert q.join(ticket('bob')).username == 'alice'
    assert q.waiting('text') == []


def test_modes_are_separate_queues(clock):
    q = MatchQueue(clock=clock)
    q.join(ticket('alice', mode='voice'))
    assert q.join(ticket('bob', mode='text')) is None


def test_shared_tags_win_over_waiting_longer(clock):
    q = MatchQueue(clock=clock)
    q.join(ticket('early', tags={'cooking'}))
    q.join(ticket('gamer', tags={'games', 'music'}))  # no overlap with 'early': both keep waiting
    clock.now += RELAX_AFTER + 1  # both could now take anyone...
    partner = q.join(ticket('me', tags={'music'}))  # ...but a shared interest wins
    assert partner.username == 'gamer'


def test_no_shared_tags_waits_until_someone_has_waited_long_enough(clock):
    q = MatchQueue(clock=clock)
    q.join(ticket('alice', tags={'hiking'}))
    assert q.join(ticket('bob', tags={'chess'})) is None  # different interests, both fresh
    assert q.sweep() == []
    clock.now += RELAX_AFTER
    pairs = q.sweep()
    assert {pairs[0][0].username, pairs[0][1].username} == {'alice', 'bob'}


def test_blocked_users_are_never_paired(clock):
    q = MatchQueue(blocked=lambda a, b: {a, b} == {'alice', 'troll'}, clock=clock)
    q.join(ticket('troll'))
    assert q.join(ticket('alice')) is None
    clock.now += 3600
    assert q.sweep() == []
    assert q.join(ticket('bob')).username in ('troll', 'alice')


def test_no_immediate_rematch_with_the_person_you_just_left(clock):
    q = MatchQueue(clock=clock)
    q.join(ticket('alice', last='bob'))
    assert q.join(ticket('bob', last='alice')) is None
    assert q.join(ticket('carol')).username == 'alice'


def test_rejoining_replaces_your_old_ticket(clock):
    q = MatchQueue(clock=clock)
    q.join(ticket('alice', mode='text'))
    q.join(ticket('alice', mode='voice'))
    assert [t.username for t in q.waiting('text')] == []
    assert [t.username for t in q.waiting('voice')] == ['alice']


def test_leave_removes_you_from_the_queue(clock):
    q = MatchQueue(clock=clock)
    q.join(ticket('alice'))
    assert q.leave('alice').username == 'alice'
    assert q.join(ticket('bob')) is None


@pytest.mark.parametrize(
    'raw, expected',
    [
        (['Music', ' music ', 'hiking'], ['music', 'hiking']),
        (['音乐', 'free text', '<script>', 'anime'], ['anime']),  # only catalog ids
        ([None, 3, 'coffee'], ['coffee']),
        (
            ['music', 'movies', 'anime', 'books', 'kpop', 'podcasts', 'travel'],
            ['music', 'movies', 'anime', 'books', 'kpop'],
        ),
        ('not a list', []),
    ],
)
def test_tags_are_normalized(raw, expected):
    assert normalize_tags(raw) == expected


def test_catalog_tags_are_unique_ids():
    import json
    from pathlib import Path

    catalog = json.loads((Path(__file__).parents[1] / 'app/src/lib/matchTags.json').read_text(encoding='utf-8'))
    ids = [tag for category in catalog['categories'] for tag in category['tags']]
    assert len(ids) == len(set(ids)) == len(TAGS)
    assert all(tag.isascii() and tag == tag.lower() and ' ' not in tag for tag in ids)

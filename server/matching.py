"""Random matching: who gets paired with whom.

Pure queue logic (no sockets, no database) so it can be tested directly; the
Socket.IO side lives in handlers/match.py.

Rules:
  * One queue per mode ('text', or 'voice' which also has text chat).
  * Tags come from a fixed catalog (app/src/lib/matchTags.json, shared with the
    client) so people actually overlap; they're ids, labels are translated.
  * Prefer the waiting person sharing the most interest tags (ties: longest wait).
  * Nobody is matched with someone who has blocked them or whom they blocked,
    nor straight back with the partner they just left.
  * With no shared tags, a pair is only made once either side has waited
    RELAX_AFTER seconds (or has no tags at all), so tags matter but small
    user counts don't stall.
"""

import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

MODES = ('text', 'voice')
MAX_TAGS = 5
_CATALOG = json.loads(
    (Path(__file__).resolve().parent.parent / 'app' / 'src' / 'lib' / 'matchTags.json').read_text(encoding='utf-8')
)
TAGS = frozenset(tag for category in _CATALOG['categories'] for tag in category['tags'])
RELAX_AFTER = 10.0  # seconds


def normalize_tags(raw) -> list[str]:
    """Known catalog tag ids only, de-duplicated, in the order given, at most MAX_TAGS."""
    if not isinstance(raw, list):
        return []
    tags = []
    for item in raw:
        if not isinstance(item, str):
            continue
        tag = item.strip().lower()
        if tag in TAGS and tag not in tags:
            tags.append(tag)
        if len(tags) == MAX_TAGS:
            break
    return tags


@dataclass
class Ticket:
    username: str
    sid: str
    mode: str
    tags: frozenset = field(default_factory=frozenset)
    since: float = field(default_factory=time.monotonic)
    last_partner: str | None = None


def _can_pair(a: Ticket, b: Ticket, blocked) -> bool:
    if a.username == b.username:
        return False
    if a.last_partner == b.username or b.last_partner == a.username:
        return False
    return not blocked(a.username, b.username)


def _relaxed(t: Ticket, now: float) -> bool:
    return not t.tags or now - t.since >= RELAX_AFTER


class MatchQueue:
    """Thread-safe waiting room. `blocked(a, b)` says whether either user blocked the other."""

    def __init__(self, blocked=lambda a, b: False, clock=time.monotonic):
        self._waiting: dict[str, list[Ticket]] = {m: [] for m in MODES}
        self._lock = threading.Lock()
        self._blocked = blocked
        self._clock = clock

    def join(self, ticket: Ticket) -> Ticket | None:
        """Queue `ticket` (replacing any earlier ticket for that user) and return a partner if one fits now."""
        with self._lock:
            self._remove_locked(ticket.username)
            ticket.since = self._clock()
            partner = self._best_partner_locked(ticket)
            if partner:
                self._waiting[ticket.mode].remove(partner)
                return partner
            self._waiting[ticket.mode].append(ticket)
            return None

    def leave(self, username: str, sid: str | None = None) -> Ticket | None:
        """Take `username` out of the queue (only if their waiting socket is `sid`, when given)."""
        with self._lock:
            return self._remove_locked(username, sid)

    def waiting(self, mode: str) -> list[Ticket]:
        with self._lock:
            return list(self._waiting[mode])

    def sweep(self) -> list[tuple[Ticket, Ticket]]:
        """Pair people who became matchable by waiting (called periodically)."""
        pairs = []
        with self._lock:
            for mode in MODES:
                queue = self._waiting[mode]
                i = 0
                while i < len(queue):
                    ticket = queue[i]
                    others = queue[:i] + queue[i + 1 :]
                    partner = self._best_partner_locked(ticket, others)
                    if partner:
                        queue.remove(ticket)
                        queue.remove(partner)
                        pairs.append((ticket, partner))
                        i = 0
                    else:
                        i += 1
        return pairs

    # ── internals (lock held) ──

    def _remove_locked(self, username: str, sid: str | None = None) -> Ticket | None:
        for queue in self._waiting.values():
            for t in queue:
                if t.username == username and (sid is None or t.sid == sid):
                    queue.remove(t)
                    return t
        return None

    def _best_partner_locked(self, ticket: Ticket, candidates=None) -> Ticket | None:
        now = self._clock()
        pool = self._waiting[ticket.mode] if candidates is None else candidates
        best, best_key = None, None
        for other in pool:
            if not _can_pair(ticket, other, self._blocked):
                continue
            shared = len(ticket.tags & other.tags)
            if shared == 0 and not (_relaxed(ticket, now) or _relaxed(other, now)):
                continue
            key = (shared, -other.since)  # most shared tags, then longest waiting
            if best_key is None or key > best_key:
                best, best_key = other, key
        return best

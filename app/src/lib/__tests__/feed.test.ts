import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeed, GROUP_GAP_MS } from '../feed';
import { clock12, formatMsgTime } from '../time';
import type { Message } from '../../components/chat/message/types';

const monthDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const NOW = new Date(2026, 8, 27, 18, 0);

function msg(id: number, at: Date): Message {
  return { id, username: 'u', screenname: 'U', text: `m${id}`, time: at.toISOString(), isOwn: false };
}
const minutes = (base: Date, n: number) => new Date(base.getTime() + n * 60_000);
const separators = (feed: ReturnType<typeof buildFeed>) => feed.filter((i) => i._type === 'sep').length;

test('a burst of messages shares one time separator', () => {
  const start = new Date(2026, 8, 27, 14, 0);
  const feed = buildFeed([msg(1, start), msg(2, minutes(start, 1)), msg(3, minutes(start, 4))], monthDay, NOW);
  assert.equal(separators(feed), 1);
  assert.equal(feed[0]._type, 'sep');
  assert.equal(feed.length, 4);
});

test('a pause longer than the gap starts a new group', () => {
  const start = new Date(2026, 8, 27, 14, 0);
  const late = new Date(start.getTime() + GROUP_GAP_MS + 60_000);
  assert.equal(separators(buildFeed([msg(1, start), msg(2, late)], monthDay, NOW)), 2);
});

test('a new day always starts a new group, even minutes apart', () => {
  const beforeMidnight = new Date(2026, 8, 26, 23, 59);
  assert.equal(separators(buildFeed([msg(1, beforeMidnight), msg(2, minutes(beforeMidnight, 2))], monthDay, NOW)), 2);
});

test('messages with unparseable times are kept without breaking grouping', () => {
  const start = new Date(2026, 8, 27, 14, 0);
  const broken = { ...msg(2, start), time: 'not a date' };
  const feed = buildFeed([msg(1, start), broken, msg(3, minutes(start, 1))], monthDay, NOW);
  assert.equal(separators(feed), 1);
  assert.equal(feed.filter((i) => i._type !== 'sep').length, 3);
});

test('back-to-back messages from one sender are marked as a continuation', () => {
  const start = new Date(2026, 8, 27, 14, 0);
  const from = (id: number, username: string, at: Date, system = false): Message =>
    ({ ...msg(id, at), username, system });
  const feed = buildFeed([
    from(1, 'ann', start),
    from(2, 'ann', minutes(start, 1)), // same sender, same burst
    from(3, 'bob', minutes(start, 2)),
    from(4, 'system', minutes(start, 2), true),
    from(5, 'bob', minutes(start, 3)), // after a system line: starts fresh
    from(6, 'bob', new Date(start.getTime() + GROUP_GAP_MS + 5 * 60_000)), // after a time separator: fresh
  ], monthDay, NOW);
  const cont = feed.filter((i) => i._type !== 'sep').map((i) => (i as { _cont?: boolean })._cont);
  assert.deepEqual(cont, [false, true, false, false, false, false]);
});

test('separator labels: time only today, date + time otherwise', () => {
  assert.equal(formatMsgTime(new Date(2026, 8, 27, 9, 5).toISOString(), monthDay, NOW), '09:05');
  assert.equal(formatMsgTime(new Date(2026, 8, 20, 9, 5).toISOString(), monthDay, NOW), '9/20 09:05');
});

test('the 12-hour clock, in each language', () => {
  const evening = new Date(2026, 8, 27, 21, 5).toISOString();
  assert.equal(formatMsgTime(evening, monthDay, NOW, clock12('en')), '9:05 PM');
  assert.equal(formatMsgTime(evening, monthDay, NOW, clock12('zh')), '下午9:05');
  assert.equal(formatMsgTime(new Date(2026, 8, 27, 0, 30).toISOString(), monthDay, NOW, clock12('en')), '12:30 AM');
  assert.equal(formatMsgTime(new Date(2026, 8, 20, 12, 0).toISOString(), monthDay, NOW, clock12('en')), '9/20 12:00 PM');
});

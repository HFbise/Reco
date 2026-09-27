import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeed, GROUP_GAP_MS } from '../feed';
import { formatMsgTime } from '../time';
import type { Message } from '../../components/MessageBubble';

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

test('separator labels: time only today, date + time otherwise', () => {
  assert.equal(formatMsgTime(new Date(2026, 8, 27, 9, 5).toISOString(), monthDay, NOW), '09:05');
  assert.equal(formatMsgTime(new Date(2026, 8, 20, 9, 5).toISOString(), monthDay, NOW), '9/20 09:05');
});

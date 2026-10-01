import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeMention, applyMention, matchMembers, mentionsMe, splitMentions } from '../mentions';

test('a mention is being typed after an @ at the start or after a space', () => {
  assert.deepEqual(activeMention('@', 1), { start: 0, query: '' });
  assert.deepEqual(activeMention('hi @bo', 6), { start: 3, query: 'bo' });
  assert.deepEqual(activeMention('hi @小明', 6), { start: 3, query: '小明' });
  assert.equal(activeMention('me@bo', 5), null); // an address
  assert.equal(activeMention('hi @bob there', 13), null); // finished: a space came after it
  assert.equal(activeMention('no at here', 10), null);
  assert.deepEqual(activeMention('@bob and @ca', 7), null); // cursor in "and"
});

test('picking someone replaces what was typed and moves past it', () => {
  const text = 'hi @bo, see you';
  const pick = applyMention(text, { start: 3, query: 'bo' }, 6, 'bob');
  assert.deepEqual(pick, { text: 'hi @bob , see you', cursor: 8 });
  assert.deepEqual(applyMention('@b', { start: 0, query: 'b' }, 2, 'bob'), { text: '@bob ', cursor: 5 });
  assert.deepEqual(applyMention('@b later', { start: 0, query: 'b' }, 2, 'bob'), { text: '@bob later', cursor: 5 });
});

test('matching people: name starts first, then contains; never yourself', () => {
  const people = [
    { username: 'alice', screenname: 'Alice' },
    { username: 'bob', screenname: 'Bobby' },
    { username: 'jimbo', screenname: 'Jim' },
    { username: 'xiaoming', screenname: '小明' },
  ];
  assert.deepEqual(matchMembers(people, 'bo', 'alice').map((m) => m.username), ['bob', 'jimbo']);
  assert.deepEqual(matchMembers(people, '', 'alice').map((m) => m.username).sort(), ['bob', 'jimbo', 'xiaoming']);
  assert.deepEqual(matchMembers(people, '明', undefined).map((m) => m.username), ['xiaoming']);
  assert.deepEqual(matchMembers(people, 'zzz', undefined), []);
});

test('only mentions the server confirmed become chips', () => {
  const mentions = { bob: 'Bobby' };
  assert.deepEqual(splitMentions('hey @Bob, and @carol', mentions), [
    { text: 'hey ' }, { username: 'bob', screenname: 'Bobby' }, { text: ', and @carol' },
  ]);
  assert.deepEqual(splitMentions('@bob', mentions), [{ username: 'bob', screenname: 'Bobby' }]);
  assert.deepEqual(splitMentions('mail me@bob.com', mentions), [{ text: 'mail me@bob.com' }]);
  assert.deepEqual(splitMentions('plain', undefined), [{ text: 'plain' }]);
  assert.equal(mentionsMe({ mentions }, 'bob'), true);
  assert.equal(mentionsMe({ mentions }, 'carol'), false);
  assert.equal(mentionsMe(null, 'bob'), false);
});

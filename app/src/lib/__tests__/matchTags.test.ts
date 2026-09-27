import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TAGS, normalizeTag, parseTagInput } from '../matchTags';

test('normalizeTag strips #, trims, lowercases and caps length', () => {
  assert.equal(normalizeTag('  #Music '), 'music');
  assert.equal(normalizeTag('##Indie   Rock'), 'indie rock');
  assert.equal(normalizeTag('x'.repeat(40)).length, 20);
});

test('parseTagInput splits on commas and skips duplicates and blanks', () => {
  assert.deepEqual(parseTagInput('Music, games,,music，anime', []), ['music', 'games', 'anime']);
  assert.deepEqual(parseTagInput('games', ['games']), ['games']);
  assert.deepEqual(parseTagInput('音乐, c++, 🎮', []), ['音乐']);
});

test('parseTagInput never goes past the limit', () => {
  const full = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(full.length, MAX_TAGS);
  assert.deepEqual(parseTagInput('f, g', full), full);
});

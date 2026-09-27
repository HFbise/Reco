import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TAGS, MAX_TAGS, TAG_CATEGORIES, knownTags, toggleTag } from '../matchTags';
import { hasKey } from '../i18n';

test('toggleTag selects, unselects and ignores unknown tags', () => {
  assert.deepEqual(toggleTag([], 'music'), ['music']);
  assert.deepEqual(toggleTag(['music', 'anime'], 'music'), ['anime']);
  assert.deepEqual(toggleTag(['music'], 'not-a-tag'), ['music']);
});

test('toggleTag never goes past the limit', () => {
  const full = ['music', 'movies', 'anime', 'books', 'kpop'];
  assert.equal(full.length, MAX_TAGS);
  assert.deepEqual(toggleTag(full, 'travel'), full);
});

test('knownTags drops tags that are not in the catalog', () => {
  assert.deepEqual(knownTags(['music', 'old free text', 'hiking']), ['music', 'hiking']);
});

test('every category and tag has a label', () => {
  for (const category of TAG_CATEGORIES) assert.ok(hasKey(`tagcat-${category.id}`), `tagcat-${category.id}`);
  for (const tag of ALL_TAGS) assert.ok(hasKey(`tag-${tag}`), `tag-${tag}`);
});

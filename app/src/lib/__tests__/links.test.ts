import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLinks } from '../links';

test('addresses in text become links, the rest stays text', () => {
  assert.deepEqual(splitLinks('see https://example.com/a?b=1 now'), [
    { text: 'see ' }, { url: 'https://example.com/a?b=1', label: 'https://example.com/a?b=1' }, { text: ' now' },
  ]);
  assert.deepEqual(splitLinks('plain words'), [{ text: 'plain words' }]);
  assert.deepEqual(splitLinks(''), [{ text: '' }]);
});

test('a bare www. address opens over https', () => {
  assert.deepEqual(splitLinks('www.reco.chat'), [{ url: 'https://www.reco.chat', label: 'www.reco.chat' }]);
});

test('sentence punctuation after an address is not part of it', () => {
  assert.deepEqual(splitLinks('go to http://a.io.'), [{ text: 'go to ' }, { url: 'http://a.io', label: 'http://a.io' }, { text: '.' }]);
  assert.deepEqual(splitLinks('看这个https://a.io/x，好玩'), [
    { text: '看这个' }, { url: 'https://a.io/x', label: 'https://a.io/x' }, { text: '，好玩' },
  ]);
  // a bracket closes the address only if the address opened it
  assert.deepEqual(splitLinks('(https://a.io/x)'), [{ text: '(' }, { url: 'https://a.io/x', label: 'https://a.io/x' }, { text: ')' }]);
  assert.deepEqual(splitLinks('https://en.wikipedia.org/wiki/Chat_(software)'), [
    { url: 'https://en.wikipedia.org/wiki/Chat_(software)', label: 'https://en.wikipedia.org/wiki/Chat_(software)' },
  ]);
});

test('nothing but http(s) is ever a link', () => {
  for (const text of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://a.io', 'mailto:a@b.c']) {
    assert.deepEqual(splitLinks(text), [{ text }]);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSendKey } from '../keys';

test('Enter sends, Shift+Enter does not', () => {
  assert.equal(isSendKey({ key: 'Enter' }), true);
  assert.equal(isSendKey({ key: 'Enter', shiftKey: true }), false);
  assert.equal(isSendKey({ key: 'a' }), false);
});

test('Enter while an input method is composing picks the candidate instead of sending', () => {
  assert.equal(isSendKey({ key: 'Enter', isComposing: true }), false);
  assert.equal(isSendKey({ key: 'Enter', keyCode: 229 }), false); // Safari reports composition this way
});

test('with Enter set to add a line, Ctrl or Cmd+Enter sends', () => {
  assert.equal(isSendKey({ key: 'Enter' }, false), false);
  assert.equal(isSendKey({ key: 'Enter', ctrlKey: true }, false), true);
  assert.equal(isSendKey({ key: 'Enter', metaKey: true }, false), true);
  assert.equal(isSendKey({ key: 'Enter', ctrlKey: true, isComposing: true }, false), false);
});

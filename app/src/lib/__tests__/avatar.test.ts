import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, getAvatarColor, nameColor } from '../avatar';

const PALETTE = ['#5865F2', '#3BA55C', '#FAA61A', '#ED4245', '#EB459E', '#57F287', '#0099E1', '#9C84EC'];

test('avatar color is stable per username', () => {
  assert.equal(getAvatarColor('alice'), getAvatarColor('alice'));
});

test('every avatar color makes a readable name in both themes', () => {
  for (const color of PALETTE) {
    assert.ok(contrastRatio(nameColor(color, false, '#F3F5FA'), '#F3F5FA') >= 4.5, `${color} on light`);
    assert.ok(contrastRatio(nameColor(color, true, '#17191E'), '#17191E') >= 4.5, `${color} on dark`);
  }
});

test('names stay close to the avatar color (no more change than needed)', () => {
  // Blue already reads well on a light ground: only a light touch
  assert.equal(nameColor('#5865F2', false, '#F3F5FA'), '#4b56ce');
});

test('contrast ratio matches the WCAG formula', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('non-hex input is returned unchanged', () => {
  assert.equal(nameColor('red', false, '#FFFFFF'), 'red');
});

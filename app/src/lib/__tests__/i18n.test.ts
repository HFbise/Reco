import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, serverError, systemMessage, securityQuestion, roomLabel, monthDay, LOBBY_ID } from '../i18n';

test('params are filled in; missing ones stay visible instead of printing "undefined"', () => {
  assert.equal(t('en', 'sys-user_joined', { name: 'Ava' }), 'Ava joined the room');
  assert.equal(t('en', 'invite-text', { name: 'Ava' }), 'Ava invited you to join {room}');
});

test('server error codes are translated, with a fallback for unknown codes', () => {
  const reply = { success: false, code: 'too_many_attempts', params: { secs: 30 } };
  assert.equal(serverError('en', reply, 'err-save-failed'), 'Too many attempts. Try again in 30s');
  assert.equal(serverError('zh', reply, 'err-save-failed'), '尝试过多，请 30 秒后重试');
  assert.equal(serverError('en', { code: 'something_new' }, 'err-save-failed'), t('en', 'err-save-failed'));
  assert.equal(serverError('en', undefined, 'err-save-failed'), t('en', 'err-save-failed'));
});

test('system messages render from their code; legacy ones keep their stored text', () => {
  const coded = { text: 'Ava 加入了房间', meta: { system: { code: 'user_joined', params: { name: 'Ava' } } } };
  assert.equal(systemMessage('en', coded), 'Ava joined the room');
  assert.equal(systemMessage('en', { text: '很久以前的消息' }), '很久以前的消息');
});

test('security questions are ids; unknown legacy text passes through', () => {
  assert.equal(securityQuestion('en', 'pet_name'), "What is your favorite pet's name?");
  assert.equal(securityQuestion('en', '自定义问题？'), '自定义问题？');
});

test('the lobby id is shown translated, other rooms verbatim', () => {
  assert.equal(roomLabel('en', LOBBY_ID), 'Lobby');
  assert.equal(roomLabel('zh', LOBBY_ID), '大厅');
  assert.equal(roomLabel('en', 'Book club'), 'Book club');
});

test('month/day follows the language', () => {
  const d = new Date(2026, 8, 27);
  assert.equal(monthDay('en', d), 'Sep 27');
  assert.equal(monthDay('zh', d), '9月27日');
});

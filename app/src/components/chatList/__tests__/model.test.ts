import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  preview, sections, withDmNotification, withDms, withLastPatched, withMessage, withOnline, withRoom, withRooms,
  type ChatEntry, type ServerDm,
} from '../model';

const lobby = { name: 'Lobby', has_password: false, unread: 0 };
const club = { name: 'club', has_password: true, needs_password: false, unread: 3, pinned: false, muted: true };
const dm = (other: string, extra: Partial<ServerDm> = {}): ServerDm => ({
  dm_room: `dm:me:${other}`, other_username: other, other_screenname: other.toUpperCase(),
  avatar_expression: 'Smile', avatar_color: '#5865F2', unread: 0, ...extra,
});
const keys = (list: ChatEntry[]) => list.map((e) => e.key);

test('rooms and DMs arrive separately and keep each other', () => {
  let list = withDms([], [dm('ann'), dm('bo')], null);
  list = withRooms(list, [lobby, club], null);
  assert.deepEqual(keys(list), ['Lobby', 'club', 'dm:me:ann', 'dm:me:bo']);
  list = withDms(list, [dm('bo')], null); // ann's DM was closed elsewhere
  assert.deepEqual(keys(list), ['Lobby', 'club', 'dm:me:bo']);
  assert.equal(list.find((e) => e.key === 'club')!.muted, true);
});

test('the open chat never counts as unread, whatever the server says', () => {
  const list = withRooms([], [club], 'club');
  assert.equal(list[0].unread, 0);
  assert.equal(withRooms([], [club], null)[0].unread, 3);
});

test('a message moves its chat to the top and counts, unless open or your own', () => {
  let list = withRooms([], [lobby, club], null);
  list = withMessage(list, { room: 'club', id: 1, username: 'ann' }, null, 'me');
  assert.deepEqual(keys(list), ['club', 'Lobby']);
  assert.equal(list[0].unread, 4);
  // Sent from your phone: it moves up but isn't "unread" on your laptop
  list = withMessage(list, { room: 'Lobby', id: 2, username: 'me' }, null, 'me');
  assert.deepEqual(keys(list), ['Lobby', 'club']);
  assert.equal(list[0].unread, 0);
  list = withMessage(list, { room: 'club', id: 3, username: 'ann' }, 'club', 'me');
  assert.equal(list[0].unread, 0);
  // A chat that isn't listed is left alone
  assert.equal(withMessage(list, { room: 'elsewhere', id: 4, username: 'ann' }, null, 'me'), list);
});

test('a DM message updates the preview, and counts once even when it also comes as a notification', () => {
  let list = withDms([], [dm('ann')], null);
  list = withMessage(list, { room: 'dm:me:ann', id: 7, username: 'ann', text: 'lunch\n  today?' }, null, 'me');
  list = withDmNotification(list, { dm_room: 'dm:me:ann', from_username: 'ann', from_screenname: 'ANN', message_id: 7 }, null);
  assert.equal(list[0].unread, 1);
  assert.equal(list[0].last?.text, 'lunch\n  today?');
  // The other order: notification first
  list = withDmNotification(list, { dm_room: 'dm:me:ann', from_username: 'ann', from_screenname: 'ANN', message_id: 8, text: 'hi' }, null);
  list = withMessage(list, { room: 'dm:me:ann', id: 8, username: 'ann', text: 'hi' }, null, 'me');
  assert.equal(list[0].unread, 2);
});

test('a notification from someone new adds their DM at the top', () => {
  let list = withRooms([], [lobby], null);
  list = withDmNotification(list, {
    dm_room: 'dm:me:zed', from_username: 'zed', from_screenname: 'Zed', message_id: 1, text: 'hey', image: false,
  }, null);
  assert.deepEqual(keys(list), ['dm:me:zed', 'Lobby']);
  assert.equal(list[0].unread, 1);
  assert.equal(list[0].online, true);
  assert.equal(list[0].avatarExpression, 'Smile');
});

test('a room added by code or creation joins once, with nothing unread', () => {
  let list = withRoom([], { name: 'club', hasPassword: true, needsPassword: true });
  list = withRoom(list, { name: 'club', hasPassword: true, needsPassword: false });
  assert.equal(list.length, 1);
  assert.equal(list[0].needsPassword, false);
  assert.equal(list[0].unread, 0);
});

test('previews follow edits and recalls; online dots follow the person', () => {
  let list = withDms([], [dm('ann', { last: { id: 5, username: 'ann', text: 'hi', recalled: false, system: false } })], null);
  list = withLastPatched(list, 5, { text: 'hello' });
  assert.equal(list[0].last?.text, 'hello');
  list = withLastPatched(list, 5, { recalled: true, text: '' });
  assert.deepEqual(preview(list[0].last, 'me'), { kind: 'recalled' });
  list = withOnline(list, 'ann', true);
  assert.equal(list[0].online, true);
});

test('sections: search by name, pinned first, otherwise in order', () => {
  let list = withRooms([], [lobby, club, { name: 'chess', has_password: false, pinned: true }], null);
  list = withDms(list, [dm('ann'), dm('bo', { pinned: true })], null);
  const all = sections(list, '');
  assert.deepEqual(keys(all.rooms), ['chess', 'Lobby', 'club']);
  assert.deepEqual(keys(all.dms), ['dm:me:bo', 'dm:me:ann']);
  assert.deepEqual(keys(sections(list, '  CH ').rooms), ['chess']);
  assert.deepEqual(keys(sections(list, 'an').dms), ['dm:me:ann']); // matches the display name ("ANN")
});

test('a preview tells mine from theirs and a photo from text', () => {
  const base = { id: 1, recalled: false, system: false };
  assert.deepEqual(preview({ ...base, username: 'me', text: '  see   you ' }, 'me'), { kind: 'message', text: 'see you', photo: false, mine: true });
  assert.deepEqual(preview({ ...base, username: 'ann', text: '', image: true }, 'me'), { kind: 'message', text: '', photo: true, mine: false });
  assert.deepEqual(preview(undefined, 'me'), { kind: 'none' });
});

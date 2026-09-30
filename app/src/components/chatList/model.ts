/**
 * The chat list's data, as pure functions: what the server's lists and live events do to it.
 * No React, no sockets, so it's tested directly (__tests__/model.test.ts).
 *
 * Order: rooms come in the server's order (lobby first), DMs newest first, and a chat that
 * gets a message moves to the top of its section. Pinned chats stay above the rest.
 */

/** The newest message of a DM, for the line under its name */
export interface DmPreview {
  id: number;
  username: string;
  text: string;
  recalled: boolean;
  system: boolean;
  meta?: any;
  /** A photo (its text may be empty) */
  image?: boolean;
}

export interface ChatEntry {
  kind: 'room' | 'dm';
  /** Room name, or the DM's id ("dm:alice:bob") */
  key: string;
  /** Room name, or the other person's display name */
  name: string;
  unread: number;
  /** This person's own settings for the chat (chat_prefs on the server) */
  pinned: boolean;
  muted: boolean;
  // Rooms
  hasPassword?: boolean;
  /** False once a member (or for the owner and admins): the password isn't asked again */
  needsPassword?: boolean;
  // DMs
  otherUsername?: string;
  avatarExpression?: string;
  avatarColor?: string;
  online?: boolean;
  last?: DmPreview;
}

/** A room in the server's rooms_list */
export interface ServerRoom {
  name: string;
  has_password: boolean;
  needs_password?: boolean;
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
}

/** A DM in the server's dms_list */
export interface ServerDm {
  dm_room: string;
  other_username: string;
  other_screenname: string;
  avatar_expression: string;
  avatar_color: string;
  unread?: number;
  online?: boolean;
  last?: DmPreview;
  pinned?: boolean;
  muted?: boolean;
}

/** The chat on screen (its messages are being read as they arrive), if any */
export type OpenChat = string | null | undefined;

/** Unread counts come from the server, so they follow you across devices; the open chat is read. */
function unreadFrom(key: string, server: number | undefined, known: number, open: OpenChat) {
  if (key === open) return 0;
  return typeof server === 'number' ? server : known;
}

export function withRooms(prev: ChatEntry[], rooms: ServerRoom[], open: OpenChat): ChatEntry[] {
  const known = new Map(prev.map((e) => [e.key, e]));
  const roomEntries = rooms.map((r): ChatEntry => ({
    ...known.get(r.name),
    kind: 'room',
    key: r.name,
    name: r.name,
    hasPassword: r.has_password,
    needsPassword: r.needs_password,
    unread: unreadFrom(r.name, r.unread, known.get(r.name)?.unread ?? 0, open),
    pinned: !!r.pinned,
    muted: !!r.muted,
  }));
  return [...roomEntries, ...prev.filter((e) => e.kind === 'dm')];
}

export function withDms(prev: ChatEntry[], dms: ServerDm[], open: OpenChat): ChatEntry[] {
  const known = new Map(prev.map((e) => [e.key, e]));
  const dmEntries = dms.map((d): ChatEntry => ({
    ...known.get(d.dm_room),
    kind: 'dm',
    key: d.dm_room,
    name: d.other_screenname,
    otherUsername: d.other_username,
    avatarExpression: d.avatar_expression,
    avatarColor: d.avatar_color,
    unread: unreadFrom(d.dm_room, d.unread, known.get(d.dm_room)?.unread ?? 0, open),
    online: d.online,
    last: d.last,
    pinned: !!d.pinned,
    muted: !!d.muted,
  }));
  return [...prev.filter((e) => e.kind === 'room'), ...dmEntries];
}

/** A room that joined the list (created, found by code, or joined): nothing unread yet. */
export function withRoom(prev: ChatEntry[], room: { name: string; hasPassword: boolean; needsPassword?: boolean }): ChatEntry[] {
  if (prev.some((e) => e.key === room.name)) {
    return prev.map((e) => (e.key === room.name
      ? { ...e, hasPassword: room.hasPassword, needsPassword: room.needsPassword ?? e.needsPassword }
      : e));
  }
  return [...prev, {
    kind: 'room', key: room.name, name: room.name, unread: 0, pinned: false, muted: false,
    hasPassword: room.hasPassword, needsPassword: room.needsPassword ?? false,
  }];
}

/** A live message: its chat moves to the top of its section and, unless it's open or the
 *  message is your own (sent from another device), counts as unread. DMs get a new preview. */
export function withMessage(
  prev: ChatEntry[],
  msg: { room: string; id: number; username: string; text?: string; meta?: any },
  open: OpenChat,
  me: string | undefined,
): ChatEntry[] {
  const index = prev.findIndex((e) => e.key === msg.room);
  if (index === -1) return prev;
  const entry = prev[index];
  // A DM message can arrive twice: as itself and as the DM notification (see withDmNotification)
  const seen = entry.kind === 'dm' && entry.last?.id === msg.id;
  const counts = msg.room !== open && msg.username !== me && !seen;
  const updated: ChatEntry = {
    ...entry,
    unread: msg.room === open ? 0 : entry.unread + (counts ? 1 : 0),
    last: entry.kind === 'dm'
      ? {
        id: msg.id, username: msg.username, text: String(msg.text ?? '').slice(0, 120),
        recalled: false, system: false, image: !!msg.meta?.image,
      }
      : entry.last,
  };
  return [updated, ...prev.slice(0, index), ...prev.slice(index + 1)];
}

/** Someone DMed you (the server tells you even if the DM isn't in your list yet). */
export function withDmNotification(
  prev: ChatEntry[],
  n: {
    dm_room: string; from_username: string; from_screenname: string; avatar_expression?: string; avatar_color?: string;
    message_id?: number; text?: string; image?: boolean;
  },
  open: OpenChat,
): ChatEntry[] {
  const last: DmPreview | undefined = n.message_id
    ? { id: n.message_id, username: n.from_username, text: n.text ?? '', recalled: false, system: false, image: !!n.image }
    : undefined;
  const existing = prev.find((e) => e.key === n.dm_room);
  if (existing) {
    // Counted once: the message event may have brought this message already
    const seen = !!n.message_id && existing.last?.id === n.message_id;
    const updated = {
      ...existing,
      unread: n.dm_room === open ? 0 : existing.unread + (seen ? 0 : 1),
      online: true,
      last: seen ? existing.last : last ?? existing.last,
    };
    return [updated, ...prev.filter((e) => e !== existing)];
  }
  return [{
    kind: 'dm', key: n.dm_room, name: n.from_screenname, otherUsername: n.from_username,
    avatarExpression: n.avatar_expression || 'Smile', avatarColor: n.avatar_color || '#5865F2',
    unread: 1, online: true, last, pinned: false, muted: false,
  }, ...prev];
}

export function patched(prev: ChatEntry[], key: string, patch: Partial<ChatEntry>): ChatEntry[] {
  return prev.map((e) => (e.key === key ? { ...e, ...patch } : e));
}

export function without(prev: ChatEntry[], key: string): ChatEntry[] {
  return prev.filter((e) => e.key !== key);
}

/** An edit or recall of a DM's newest message shows in its preview. */
export function withLastPatched(prev: ChatEntry[], messageId: number, patch: Partial<DmPreview>): ChatEntry[] {
  return prev.map((e) => (e.last?.id === messageId ? { ...e, last: { ...e.last, ...patch } } : e));
}

export function withOnline(prev: ChatEntry[], username: string, online: boolean): ChatEntry[] {
  return prev.map((e) => (e.kind === 'dm' && e.otherUsername === username ? { ...e, online } : e));
}

/** What the list shows: the two sections, filtered by the search box, pinned chats first. */
export function sections(entries: ChatEntry[], search: string): { rooms: ChatEntry[]; dms: ChatEntry[] } {
  const q = search.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const pinnedFirst = (list: ChatEntry[]) => [...list.filter((e) => e.pinned), ...list.filter((e) => !e.pinned)];
  return {
    rooms: pinnedFirst(shown.filter((e) => e.kind === 'room')),
    dms: pinnedFirst(shown.filter((e) => e.kind === 'dm')),
  };
}

/** The line under a DM's name, before translation. */
export type Preview =
  | { kind: 'none' }
  | { kind: 'recalled' }
  | { kind: 'system'; last: DmPreview }
  | { kind: 'message'; text: string; photo: boolean; mine: boolean };

export function preview(last: DmPreview | undefined, me: string | undefined): Preview {
  if (!last) return { kind: 'none' };
  if (last.recalled) return { kind: 'recalled' };
  if (last.system) return { kind: 'system', last };
  return {
    kind: 'message',
    text: last.text.replace(/\s+/g, ' ').trim(),
    photo: !!last.image && !last.text,
    mine: last.username === me,
  };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '../components/MessageBubble';

// Per-user key: a shared device must never show one account's messages to another
const keyFor = (username: string) => `msgCache_v2:${username}`;
// v1 was shared across accounts and could contain messages filed under the wrong room
const LEGACY_KEY = 'msgCache_v1';
const MAX = 100;

// room → messages (in-memory, backed by AsyncStorage)
const cache = new Map<string, Message[]>();
let owner: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!owner) return;
  const key = keyFor(owner);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const obj: Record<string, Message[]> = {};
      cache.forEach((msgs, room) => { obj[room] = msgs; });
      await AsyncStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }, 500);
}

/** Load `username`'s cache, replacing whatever is in memory. */
export async function loadMessageCache(username: string) {
  resetMessageCache();
  owner = username;
  try {
    AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
    const raw = await AsyncStorage.getItem(keyFor(username));
    if (!raw) return;
    const obj: Record<string, Message[]> = JSON.parse(raw);
    for (const [room, msgs] of Object.entries(obj)) {
      cache.set(room, msgs);
    }
  } catch {}
}

/** Signing out: forget the cache and delete the saved copy, so private messages
 *  don't stay readable in this browser / on this device. */
export async function clearMessageCache() {
  const key = owner ? keyFor(owner) : null;
  resetMessageCache();
  if (key) await AsyncStorage.removeItem(key).catch(() => {});
}

/** Forget the in-memory cache (switching accounts); the saved copy stays on disk. */
export function resetMessageCache() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  cache.clear();
  owner = null;
}

export function getCached(room: string): Message[] {
  return cache.get(room) ?? [];
}

export function getLastTs(room: string): string | null {
  const msgs = cache.get(room);
  if (!msgs?.length) return null;
  return msgs[msgs.length - 1].time ?? null;
}

/** Drop a room's cached messages (the server sent a fresh latest page instead). */
export function resetRoom(room: string) {
  cache.delete(room);
  scheduleSave();
}

export function cacheMsg(room: string, msg: Message) {
  const msgs = cache.get(room) ?? [];
  if (msgs.some(m => m.id === msg.id)) return;
  msgs.push(msg);
  if (msgs.length > MAX) msgs.shift();
  cache.set(room, msgs);
  scheduleSave();
}

export function patchCached(room: string, id: number, patch: Partial<Message>) {
  const msgs = cache.get(room);
  if (!msgs) return;
  const i = msgs.findIndex(m => m.id === id);
  if (i !== -1) {
    Object.assign(msgs[i], patch);
    scheduleSave();
  }
}

/** Keep the quotes of message `id` (in replies to it) in step with an edit or recall. */
export function patchCachedQuotes(room: string, id: number, patch: Partial<NonNullable<Message['reply']>>) {
  const msgs = cache.get(room);
  if (!msgs) return;
  let changed = false;
  for (const m of msgs) {
    if (m.reply?.id === id) { m.reply = { ...m.reply, ...patch }; changed = true; }
  }
  if (changed) scheduleSave();
}

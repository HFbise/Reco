import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from '../components/MessageBubble';

const KEY = 'msgCache_v1';
const MAX = 100;

// room → messages (in-memory, backed by AsyncStorage)
const cache = new Map<string, Message[]>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const obj: Record<string, Message[]> = {};
      cache.forEach((msgs, room) => { obj[room] = msgs; });
      await AsyncStorage.setItem(KEY, JSON.stringify(obj));
    } catch {}
  }, 500);
}

export async function loadMessageCache() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const obj: Record<string, Message[]> = JSON.parse(raw);
    for (const [room, msgs] of Object.entries(obj)) {
      cache.set(room, msgs);
    }
  } catch {}
}

export function getCached(room: string): Message[] {
  return cache.get(room) ?? [];
}

export function getLastTs(room: string): string | null {
  const msgs = cache.get(room);
  if (!msgs?.length) return null;
  return msgs[msgs.length - 1].time ?? null;
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

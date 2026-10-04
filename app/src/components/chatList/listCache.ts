import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatEntry } from './model';

/**
 * The chat list as it was last shown, kept on this device per account: it's on screen at once
 * when the app opens, while the server is asked what changed. `digests` fingerprint the rooms
 * and DM lists exactly as the server last sent them; one is dropped (null) as soon as anything
 * changes that list here, so the server is never told "I have it" about a list that has moved on.
 */
export interface SavedList {
  entries: ChatEntry[];
  digests: { rooms: string | null; dms: string | null };
}

const keyFor = (username: string) => `chat-list:${username}`;

export async function loadList(username: string): Promise<SavedList | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(username));
    const saved = raw ? JSON.parse(raw) : null;
    return saved && Array.isArray(saved.entries) ? saved : null;
  } catch {
    return null;
  }
}

export function saveList(username: string, list: SavedList) {
  AsyncStorage.setItem(keyFor(username), JSON.stringify(list)).catch(() => {});
}

export async function clearList(username: string) {
  await AsyncStorage.removeItem(keyFor(username)).catch(() => {});
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'roomPasswords';
let cache: Record<string, string> = {};

export async function loadRoomPasswords() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cache = JSON.parse(raw);
  } catch {}
}

export function getSavedRoomPassword(room: string): string | null {
  return cache[room] ?? null;
}

export async function saveRoomPassword(room: string, pw: string) {
  cache[room] = pw;
  try { await AsyncStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
}

export async function clearRoomPassword(room: string) {
  delete cache[room];
  try { await AsyncStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
}

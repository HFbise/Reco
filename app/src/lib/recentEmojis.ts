import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'recentReactionEmojis';
const MAX_RECENT = 8;

export const QUICK_EMOJIS_DEFAULT = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

let _cache: string[] | null = null;

export function buildReactionQuickList(recent: string[]): string[] {
  const fill = QUICK_EMOJIS_DEFAULT.filter(e => !recent.includes(e));
  return [...recent, ...fill].slice(0, MAX_RECENT);
}

export async function loadRecentEmojis(): Promise<string[]> {
  if (_cache !== null) return _cache;
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY);
    _cache = val ? JSON.parse(val) : [];
  } catch { _cache = []; }
  return _cache!;
}

export async function recordRecentEmoji(emoji: string): Promise<string[]> {
  const recent = await loadRecentEmojis();
  _cache = [emoji, ...recent.filter(e => e !== emoji)].slice(0, MAX_RECENT);
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_cache)); } catch {}
  return _cache;
}

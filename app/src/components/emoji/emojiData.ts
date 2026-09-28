import { EMOJI_CDN, type Lang } from '../../lib/i18n';

export interface EmojiEntry { emoji: string; annotation: string; group: number; tags?: string[] }

/**
 * Emoji groups we show, in order (the Unicode CLDR groups). Group 2 is left out:
 * it holds bare skin-tone and hair components, which aren't emoji on their own.
 */
export const GROUPS = [0, 1, 3, 4, 5, 6, 7, 8, 9] as const;
export type Group = typeof GROUPS[number];

// Offline or blocked CDN: a small set that still covers the everyday ones
const FALLBACK: EmojiEntry[] = [
  '😀', '😂', '🥰', '😍', '🤩', '😎', '🥳', '😭', '😤', '🤔',
  '👍', '👎', '👌', '✌️', '💪', '🙏', '👏', '🤝', '❤️', '🔥',
  '🎉', '✨', '💯', '🚀', '⭐', '🌈', '🎁', '🍕', '🎮', '💻',
].map((e) => ({ emoji: e, annotation: e, group: 0 }));

const cache: Partial<Record<Lang, EmojiEntry[]>> = {};
const pending: Partial<Record<Lang, Promise<EmojiEntry[]>>> = {};

/** The full emoji set with names in `lang` (for search). Fetched once per language, on first open. */
export function loadEmoji(lang: Lang): Promise<EmojiEntry[]> {
  if (cache[lang]) return Promise.resolve(cache[lang]!);
  if (!pending[lang]) {
    pending[lang] = fetch(EMOJI_CDN[lang])
      .then((r) => r.json())
      .then((raw: any) => {
        const all: any[] = Array.isArray(raw) ? raw : (raw.emoji || []);
        cache[lang] = all
          .filter((e) => (GROUPS as readonly number[]).includes(e.group))
          .map((e) => ({ emoji: e.emoji, annotation: e.annotation || '', group: e.group, tags: e.tags }));
        return cache[lang]!;
      })
      .catch(() => {
        delete pending[lang]; // try again next time
        return FALLBACK;
      });
  }
  return pending[lang]!;
}

export const cachedEmoji = (lang: Lang) => cache[lang];

export function searchEmoji(all: EmojiEntry[], query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all.filter((e) => e.annotation.toLowerCase().includes(q) || e.tags?.some((tag) => tag.toLowerCase().includes(q)));
}

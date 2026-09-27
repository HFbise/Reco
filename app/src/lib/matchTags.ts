/**
 * The interest-tag catalog for random matching. Shared with the server
 * (matching.py reads the same JSON), so both sides agree on what's valid.
 * Tags are ids; their labels live in i18n as `tag-<id>` / `tagcat-<id>`.
 */
import catalog from './matchTags.json';

export const MAX_TAGS = 5;
/** After this long without a shared-interest partner, anyone can be matched (matching.RELAX_AFTER). */
export const RELAX_AFTER_MS = 10_000;

export interface TagCategory {
  id: string;
  tags: string[];
}

export const TAG_CATEGORIES: TagCategory[] = catalog.categories;
export const ALL_TAGS: ReadonlySet<string> = new Set(TAG_CATEGORIES.flatMap((c) => c.tags));

/** Select or unselect `tag`; selecting beyond MAX_TAGS (or an unknown tag) changes nothing. */
export function toggleTag(selected: string[], tag: string): string[] {
  if (selected.includes(tag)) return selected.filter((x) => x !== tag);
  if (!ALL_TAGS.has(tag) || selected.length >= MAX_TAGS) return selected;
  return [...selected, tag];
}

/** Drop anything no longer in the catalog (e.g. tags remembered from an older version). */
export function knownTags(tags: string[]): string[] {
  return tags.filter((tag) => ALL_TAGS.has(tag)).slice(0, MAX_TAGS);
}

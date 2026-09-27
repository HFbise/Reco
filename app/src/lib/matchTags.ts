/** Client-side mirror of matching.py's tag rules (the server re-validates). */

export const MAX_TAGS = 5;
export const MAX_TAG_LEN = 20;
/** After this long without a shared-interest partner, anyone can be matched (matching.RELAX_AFTER). */
export const RELAX_AFTER_MS = 10_000;

/** Letters of any script, digits, spaces, - and _ (Python's [\w\- ]) */
const VALID = /^[\p{L}\p{M}\p{N}_\- ]+$/u;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LEN);
}

/** Add what the user typed (comma/space separated) to `existing`, de-duplicated, capped at MAX_TAGS. */
export function parseTagInput(input: string, existing: string[]): string[] {
  const out = [...existing];
  for (const part of input.split(/[,，]/)) {
    const tag = normalizeTag(part);
    if (tag && VALID.test(tag) && !out.includes(tag) && out.length < MAX_TAGS) out.push(tag);
  }
  return out;
}

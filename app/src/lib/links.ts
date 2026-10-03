/**
 * Web addresses in message text, so the bubble can make them tappable (tested in
 * __tests__/links.test.ts). Only http(s) addresses and bare "www." ones count: nothing else
 * (javascript:, data:, ...) ever becomes a link.
 */

export type LinkPart = { text: string } | { url: string; label: string };

// An address runs to the next space, or to Chinese/Japanese/Korean text or full-width punctuation
// (written right after it with no space); then punctuation that ends a sentence is given back
const LINK_RE = /\b(?:https?:\/\/|www\.)[^\s<>"　-〿぀-ヿ㐀-鿿가-힯＀-￯]+/gi;
const TRAILING = /[.,;:!?'"’”。，；：！？、]+$/;

/** A closing bracket at the end belongs to the address only if the address opened one */
function trimClosers(candidate: string): string {
  let out = candidate;
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
    while (out.endsWith(close) && out.split(open).length < out.split(close).length) out = out.slice(0, -1);
  }
  return out;
}

export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index ?? 0;
    let label = match[0];
    for (let prev = ''; prev !== label;) {
      prev = label;
      label = trimClosers(label.replace(TRAILING, ''));
    }
    if (!label || /^www\.$/i.test(label)) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ url: /^www\./i.test(label) ? `https://${label}` : label, label });
    last = start + label.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}

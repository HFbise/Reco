/**
 * @mentions, as pure functions (tested in __tests__/mentions.test.ts). A message holds
 * @username; the server lists who that really named in meta.mentions ({username: screenname}),
 * and the bubble shows each of those as @Screenname (see mentions.py on the server). A room's
 * owner and admins can also write @everyone, which the server marks with meta.everyone.
 */

/** The name that @mentions a whole room (no account can have it) */
export const EVERYONE = 'everyone';

export interface Mentionable {
  username: string;
  screenname: string;
  avatar_expression?: string;
  avatar_color?: string;
}

/** The @word being typed at the cursor: where its @ is and what follows it so far. */
export interface ActiveMention { start: number; query: string }

const MAX_QUERY = 20;

/** The mention being typed when the cursor sits at `cursor`, if any: an @ at the start or after
 *  a space, followed (up to the cursor) by no space. "me@x" is an address, not a mention. */
export function activeMention(text: string, cursor: number): ActiveMention | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (query.length > MAX_QUERY || /[\s@]/.test(query)) return null;
  return { start: at, query };
}

/** `text` with the mention being typed (from its @ to the cursor) replaced by @username and a
 *  space, and where the cursor goes next. */
export function applyMention(text: string, mention: ActiveMention, cursor: number, username: string) {
  const inserted = `@${username} `;
  const after = text.slice(cursor).replace(/^ /, '');
  return { text: text.slice(0, mention.start) + inserted + after, cursor: mention.start + inserted.length };
}

/** People matching what's typed after @ (by username or display name), best first: names that
 *  start with it before names that only contain it. Not you. */
export function matchMembers(members: Mentionable[], query: string, me: string | undefined, limit = 6): Mentionable[] {
  const q = query.toLowerCase();
  const scored: [number, Mentionable][] = [];
  for (const m of members) {
    if (m.username === me) continue;
    const name = m.screenname.toLowerCase();
    const score = m.username.startsWith(q) || name.startsWith(q) ? 0
      : m.username.includes(q) || name.includes(q) ? 1 : -1;
    if (score >= 0) scored.push([score, m]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].screenname.localeCompare(b[1].screenname));
  return scored.slice(0, limit).map(([, m]) => m);
}

export type Segment = { text: string } | { username: string; screenname: string } | { everyone: true };

/** The message text in pieces: plain text, and the @mentions the server confirmed. */
export function splitMentions(text: string, mentions: Record<string, string> | undefined, everyone = false): Segment[] {
  if (!everyone && (!mentions || !Object.keys(mentions).length)) return [{ text }];
  const out: Segment[] = [];
  const re = /(^|[^A-Za-z0-9_@.])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const username = m[2].toLowerCase();
    const all = everyone && username === EVERYONE;
    if (!all && !(mentions && username in mentions)) continue;
    const at = m.index + m[1].length;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push(all ? { everyone: true } : { username, screenname: mentions![username] });
    last = at + 1 + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** A message's meta after an edit changed who it mentions */
export function withMentions<M extends { mentions?: Record<string, string>; everyone?: boolean }>(
  meta: M | null | undefined, mentions: Record<string, string> | undefined, everyone = false,
): M | null {
  const { mentions: _old, everyone: _all, ...rest } = (meta ?? {}) as M;
  const next = {
    ...rest,
    ...(mentions && Object.keys(mentions).length ? { mentions } : {}),
    ...(everyone ? { everyone: true } : {}),
  } as M;
  return Object.keys(next).length ? next : null;
}

/** Does this message @mention `me` (by name, or @everyone)? */
export function mentionsMe(meta: any, me: string | undefined): boolean {
  return !!me && (!!meta?.everyone || (!!meta?.mentions && me in meta.mentions));
}

/** Whether to offer @everyone for what's typed after @: it starts the word, or its name in
 *  the app's language (so "所" finds 所有人). */
export function offersEveryone(query: string, label: string): boolean {
  const q = query.toLowerCase();
  return EVERYONE.startsWith(q) || label.toLowerCase().startsWith(q);
}

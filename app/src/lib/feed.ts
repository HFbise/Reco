import type { Message } from '../components/MessageBubble';
import { formatMsgTime, sameDay } from './time';

export type FeedItem =
  | (Message & { _type?: 'msg' })
  | { _type: 'sep'; _id: string; time: string };

/** A time separator starts a new group after this much silence (or on a new day). */
export const GROUP_GAP_MS = 5 * 60 * 1000;

/**
 * Messages (oldest first) interleaved with time separators, the way chat apps
 * group them: one label per burst of conversation rather than per minute.
 */
export function buildFeed(messages: Message[], monthDay: (d: Date) => string, now: Date = new Date()): FeedItem[] {
  const items: FeedItem[] = [];
  let previous: Date | null = null;
  for (const msg of messages) {
    const at = new Date(msg.time);
    const valid = !isNaN(at.getTime());
    if (valid && (!previous || at.getTime() - previous.getTime() > GROUP_GAP_MS || !sameDay(at, previous))) {
      items.push({ _type: 'sep', _id: `sep_${msg.id}`, time: formatMsgTime(msg.time, monthDay, now) });
    }
    if (valid) previous = at;
    items.push({ ...msg, _type: 'msg' });
  }
  return items;
}

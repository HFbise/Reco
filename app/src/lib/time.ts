/** The time of day as shown next to messages */
export type Clock = (d: Date) => string;

const pad = (n: number) => String(n).padStart(2, '0');

/** "21:05" */
export const clock24: Clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "9:05 PM" / "下午9:05" */
export function clock12(lang: 'zh' | 'en'): Clock {
  return (d) => {
    const h = d.getHours() % 12 || 12;
    const pm = d.getHours() >= 12;
    return lang === 'zh' ? `${pm ? '下午' : '上午'}${h}:${pad(d.getMinutes())}` : `${h}:${pad(d.getMinutes())} ${pm ? 'PM' : 'AM'}`;
  };
}

/** "14:05" for today, otherwise the localized month/day plus the time ("Sep 27 14:05"). */
export function formatMsgTime(time: string, monthDay: (d: Date) => string, now: Date = new Date(), clock: Clock = clock24): string {
  if (!time) return '';
  const d = new Date(time);
  if (isNaN(d.getTime())) return time;
  return sameDay(d, now) ? clock(d) : `${monthDay(d)} ${clock(d)}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** How long ago `iso` was, in the steps a "last online" line uses */
export type Ago =
  | { unit: 'now' }
  | { unit: 'minutes' | 'hours' | 'days'; n: number }
  | { unit: 'date'; date: Date };

export function ago(iso: string, now: Date = new Date()): Ago {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 2) return { unit: 'now' };
  if (minutes < 60) return { unit: 'minutes', n: minutes };
  if (minutes < 24 * 60) return { unit: 'hours', n: Math.floor(minutes / 60) };
  if (minutes < 7 * 24 * 60) return { unit: 'days', n: Math.floor(minutes / (24 * 60)) };
  return { unit: 'date', date: then };
}

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

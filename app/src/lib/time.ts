/** "14:05" for today, otherwise the localized month/day plus the time ("Sep 27 14:05"). */
export function formatMsgTime(time: string, monthDay: (d: Date) => string, now: Date = new Date()): string {
  if (!time) return '';
  const d = new Date(time);
  if (isNaN(d.getTime())) return time;
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return sameDay(d, now) ? hhmm : `${monthDay(d)} ${hhmm}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

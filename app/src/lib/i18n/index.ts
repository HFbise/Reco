import { en } from './en';
import { zh } from './zh';

/** The app's two languages: the strings are in zh.ts and en.ts, the helpers here. */
export type Lang = 'zh' | 'en';

const strings: Record<Lang, Record<keyof typeof zh, string>> = { zh, en };

export type I18nKey = keyof typeof zh;

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Params = Record<string, string | number>;

/** Translate `key`, filling `{placeholders}` from `params`. */
export function t(lang: Lang, key: I18nKey, params?: Params): string {
  const template: string = strings[lang][key] ?? strings.zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export function hasKey(key: string): key is I18nKey {
  return key in zh;
}

/** Match interest tag id → label (unknown ids are shown as-is). */
export function tagLabel(lang: Lang, id: string): string {
  const key = `tag-${id}`;
  return hasKey(key) ? t(lang, key) : id;
}

/** Text for a failed server reply: its error `code` when known, else `fallback`. */
export function serverError(lang: Lang, data: { code?: string; params?: Params; msg?: string } | null | undefined,
                            fallback: I18nKey): string {
  const key = data?.code ? `srv-${data.code}` : '';
  if (hasKey(key)) return t(lang, key, data?.params);
  return data?.msg || t(lang, fallback);
}

/** A system message rendered in the reader's language (older messages only have Chinese text). */
export function systemMessage(lang: Lang, msg: { text: string; meta?: any }): string {
  const sys = msg.meta?.system;
  const key = sys?.code ? `sys-${sys.code}` : '';
  return hasKey(key) ? t(lang, key, sys.params) : msg.text;
}

/** Security questions are stored as ids; accounts from before that store the question text. */
export function securityQuestion(lang: Lang, idOrText: string): string {
  const key = `secq-${idOrText}`;
  return hasKey(key) ? t(lang, key) : idOrText;
}

export const LOBBY_ID = '大厅';

/** Display name for a room: the lobby's id is Chinese, so show it translated. */
export function roomLabel(lang: Lang, room: string): string {
  return room === LOBBY_ID ? t(lang, 'lobby') : room;
}

export function monthYear(lang: Lang, d: Date): string {
  return t(lang, 'date-month-year', { month: d.getMonth() + 1, monthName: MONTHS_EN[d.getMonth()], year: d.getFullYear() });
}

export function monthDay(lang: Lang, d: Date): string {
  return t(lang, 'date-month-day', { month: d.getMonth() + 1, monthName: MONTHS_EN[d.getMonth()], day: d.getDate() });
}

export const EMOJI_CDN: Record<Lang, string> = {
  zh: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1/zh/cldr-native/data.json',
  en: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1/en/cldr/data.json',
};

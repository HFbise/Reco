import { useMemo } from 'react';
import { useLangStore } from '../store/langStore';
import {
  t as _t, serverError, systemMessage, securityQuestion, roomLabel, monthDay, tagLabel,
  type I18nKey, type Params,
} from '../lib/i18n';

/**
 * `t(key, params?)` in the current language, plus helpers for text that comes
 * from the server as codes or ids:
 *   t.server(reply, fallbackKey)  failed reply → message
 *   t.system(msg)                 system message → sentence
 *   t.room(name)                  room name for display (the lobby is translated)
 *   t.question(id)                security question
 *   t.monthDay(date)              "Sep 27" / "9月27日"
 *   t.tag(id)                     match interest tag
 */
export function useT() {
  const lang = useLangStore(s => s.lang);
  return useMemo(() => Object.assign(
    (key: I18nKey, params?: Params) => _t(lang, key, params),
    {
      lang,
      server: (data: Parameters<typeof serverError>[1], fallback: I18nKey) => serverError(lang, data, fallback),
      system: (msg: { text: string; meta?: any }) => systemMessage(lang, msg),
      room: (name: string) => roomLabel(lang, name),
      question: (idOrText: string) => securityQuestion(lang, idOrText),
      monthDay: (d: Date) => monthDay(lang, d),
      tag: (id: string) => tagLabel(lang, id),
    },
  ), [lang]);
}

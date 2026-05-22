import { useLangStore } from '../store/langStore';
import { t as _t, type I18nKey } from '../lib/i18n';

export function useT() {
  const lang = useLangStore(s => s.lang);
  return (key: I18nKey) => _t(lang, key);
}

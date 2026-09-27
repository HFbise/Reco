import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '../lib/i18n';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  load: () => Promise<void>;
}

/** First visit: follow the device language (Chinese devices get Chinese, everyone else English). */
function deviceLang(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export const useLangStore = create<LangState>((set) => ({
  lang: deviceLang(),
  setLang: (lang) => {
    set({ lang });
    AsyncStorage.setItem('lang', lang).catch(() => {});
  },
  load: async () => {
    try {
      const saved = await AsyncStorage.getItem('lang');
      if (saved === 'zh' || saved === 'en') set({ lang: saved });
    } catch {}
  },
}));

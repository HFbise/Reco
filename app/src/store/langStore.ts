import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lang } from '../lib/i18n';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  load: () => Promise<void>;
}

export const useLangStore = create<LangState>((set) => ({
  lang: 'zh',
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

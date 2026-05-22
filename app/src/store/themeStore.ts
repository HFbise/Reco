import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

interface ThemeState {
  isDark: boolean;
  toggle: () => Promise<void>;
  load: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: false,

  toggle: async () => {
    const next = !get().isDark;
    await AsyncStorage.setItem('theme', next ? 'dark' : 'light');
    set({ isDark: next });
  },

  load: async () => {
    try {
      const saved = await AsyncStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') {
        set({ isDark: saved === 'dark' });
      } else {
        set({ isDark: Appearance.getColorScheme() === 'dark' });
      }
    } catch {
      set({ isDark: false });
    }
  },
}));

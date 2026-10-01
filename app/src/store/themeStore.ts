import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeState {
  /** What the person chose; 'system' follows the device */
  mode: ThemeMode;
  /** What is showing now */
  isDark: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
  /** The quick sun/moon button: the opposite of what's showing, from now on */
  toggle: () => Promise<void>;
  load: () => Promise<void>;
}

const systemIsDark = () => Appearance.getColorScheme() === 'dark';

export const useThemeStore = create<ThemeState>((set, get) => {
  // While following the system, follow it live (the OS switching to dark at sunset)
  Appearance.addChangeListener(({ colorScheme }) => {
    if (get().mode === 'system') set({ isDark: colorScheme === 'dark' });
  });

  return {
    mode: 'system',
    isDark: false,

    setMode: async (mode) => {
      set({ mode, isDark: mode === 'system' ? systemIsDark() : mode === 'dark' });
      await AsyncStorage.setItem('theme', mode).catch(() => {});
    },

    toggle: () => get().setMode(get().isDark ? 'light' : 'dark'),

    load: async () => {
      try {
        const saved = await AsyncStorage.getItem('theme');
        const mode: ThemeMode = saved === 'dark' || saved === 'light' ? saved : 'system';
        set({ mode, isDark: mode === 'system' ? systemIsDark() : mode === 'dark' });
      } catch {
        set({ mode: 'system', isDark: systemIsDark() });
      }
    },
  };
});

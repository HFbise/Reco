import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SoundState {
  soundEnabled: boolean;
  toggle: () => Promise<void>;
  load: () => Promise<void>;
}

export const useSoundStore = create<SoundState>((set, get) => ({
  soundEnabled: true,

  toggle: async () => {
    const next = !get().soundEnabled;
    await AsyncStorage.setItem('notifSound', next ? 'true' : 'false');
    set({ soundEnabled: next });
  },

  load: async () => {
    try {
      const saved = await AsyncStorage.getItem('notifSound');
      set({ soundEnabled: saved !== 'false' });
    } catch {
      set({ soundEnabled: true });
    }
  },
}));

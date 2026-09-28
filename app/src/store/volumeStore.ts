import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setUserVolume } from '../lib/webrtc';

const KEY = 'userVolumes';

interface VolumeState {
  /** username → percent (0–150); people not listed are at 100 */
  volumes: Record<string, number>;
  setVolume: (username: string, percent: number) => void;
  load: () => Promise<void>;
}

/** How loud each person in voice is for you. Kept on this device, like a Discord user volume. */
export const useVolumeStore = create<VolumeState>((set, get) => ({
  volumes: {},

  setVolume: (username, percent) => {
    const volumes = { ...get().volumes, [username]: Math.round(percent) };
    if (volumes[username] === 100) delete volumes[username];
    setUserVolume(username, percent);
    set({ volumes });
    AsyncStorage.setItem(KEY, JSON.stringify(volumes)).catch(() => {});
  },

  load: async () => {
    try {
      const volumes: Record<string, number> = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}');
      for (const [username, percent] of Object.entries(volumes)) setUserVolume(username, percent);
      set({ volumes });
    } catch {
      set({ volumes: {} });
    }
  },
}));

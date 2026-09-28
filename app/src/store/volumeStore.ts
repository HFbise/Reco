import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_VOLUME, setSpeakerVolumeAll, setUserVolume } from '../lib/webrtc';

const USERS_KEY = 'userVolumes';
const LEVELS_KEY = 'audioLevels';

const clamp = (percent: number) => Math.round(Math.max(0, Math.min(MAX_VOLUME, percent)));

interface VolumeState {
  /** Your microphone, percent (0–150): how loud you are for everyone */
  mic: number;
  /** Everything you hear, percent (0–150) */
  speaker: number;
  /** username → percent (0–150); people not listed are at 100 */
  volumes: Record<string, number>;
  setMic: (percent: number) => void;
  setSpeaker: (percent: number) => void;
  setVolume: (username: string, percent: number) => void;
  load: () => Promise<void>;
}

/** Voice volumes, kept on this device and shared by every voice session in the app. */
export const useVolumeStore = create<VolumeState>((set, get) => {
  const saveLevels = () =>
    AsyncStorage.setItem(LEVELS_KEY, JSON.stringify({ mic: get().mic, speaker: get().speaker })).catch(() => {});

  return {
    mic: 100,
    speaker: 100,
    volumes: {},

    // Applying them to live audio is useVoice's job (it knows about mute and deafen)
    setMic: (percent) => { set({ mic: clamp(percent) }); saveLevels(); },
    setSpeaker: (percent) => { set({ speaker: clamp(percent) }); saveLevels(); },

    setVolume: (username, percent) => {
      const volumes = { ...get().volumes, [username]: clamp(percent) };
      if (volumes[username] === 100) delete volumes[username];
      setUserVolume(username, percent);
      set({ volumes });
      AsyncStorage.setItem(USERS_KEY, JSON.stringify(volumes)).catch(() => {});
    },

    load: async () => {
      try {
        const [[, users], [, levels]] = await AsyncStorage.multiGet([USERS_KEY, LEVELS_KEY]);
        const volumes: Record<string, number> = JSON.parse(users || '{}');
        for (const [username, percent] of Object.entries(volumes)) setUserVolume(username, percent);
        const { mic = 100, speaker = 100 } = JSON.parse(levels || '{}');
        setSpeakerVolumeAll(clamp(speaker) / 100);
        set({ volumes, mic: clamp(mic), speaker: clamp(speaker) });
      } catch {
        set({ volumes: {}, mic: 100, speaker: 100 });
      }
    },
  };
});

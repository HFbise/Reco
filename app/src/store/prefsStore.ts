import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TextSize = 'small' | 'default' | 'large';

/** Message text, by setting: font size and line height */
export const TEXT_SIZES: Record<TextSize, { fontSize: number; lineHeight: number }> = {
  small: { fontSize: 14, lineHeight: 20 },
  default: { fontSize: 15, lineHeight: 22 },
  large: { fontSize: 17, lineHeight: 25 },
};

interface Prefs {
  /** Enter sends (Shift+Enter adds a line), or adds a line (Ctrl/⌘+Enter sends). Keyboards only. */
  enterSends: boolean;
  textSize: TextSize;
  /** 9:05 PM instead of 21:05 */
  hour12: boolean;
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

/** How chatting looks and feels on this device (settings that every device shares are on the
 *  server, see useAccountSettings). */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      enterSends: true,
      textSize: 'default',
      hour12: false,
      set: (patch) => set(patch),
    }),
    { name: 'chat-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

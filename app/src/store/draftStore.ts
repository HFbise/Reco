import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_DRAFTS = 50; // the most recently typed-in chats keep theirs

interface DraftState {
  /** What was typed in each chat's message box and not sent yet: room -> text */
  drafts: Record<string, string>;
  setDraft: (room: string, text: string) => void;
  clear: () => void;
}

/** Unsent text, per chat, kept on this device (and dropped on sign-out with the message cache). */
export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (room, text) => set((s) => {
        const { [room]: _old, ...rest } = s.drafts;
        if (!text.trim()) return { drafts: rest };
        // Newest last: when there are too many, the ones left longest go first
        const kept = Object.entries(rest).slice(-(MAX_DRAFTS - 1));
        return { drafts: { ...Object.fromEntries(kept), [room]: text } };
      }),
      clear: () => set({ drafts: {} }),
    }),
    { name: 'chat-drafts', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ drafts: s.drafts }) },
  ),
);

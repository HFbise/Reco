import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PeopleState {
  /** Usernames you blocked (also saved on this device, so their messages stay hidden offline) */
  blocked: string[];
  setBlocked: (list: string[]) => void;
  addBlocked: (username: string) => void;
  removeBlocked: (username: string) => void;
  /** username → the name you gave them (only you see it; the server sends the list) */
  nicknames: Record<string, string>;
  setNicknames: (names: Record<string, string>) => void;
}

/** What you've set about other people, kept with your account: blocks and nicknames. */
export const usePeopleStore = create<PeopleState>()(
  persist(
    (set) => ({
      blocked: [],
      setBlocked: (list) => set({ blocked: list }),
      addBlocked: (username) => set((s) => ({ blocked: [...s.blocked.filter((u) => u !== username), username] })),
      removeBlocked: (username) => set((s) => ({ blocked: s.blocked.filter((u) => u !== username) })),
      nicknames: {},
      setNicknames: (nicknames) => set({ nicknames }),
    }),
    // The key from when this held blocks only, so a saved list carries over
    { name: 'block-store', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ blocked: s.blocked }) },
  ),
);

/** `name(username, fallback)`: your nickname for them, else `fallback` (their display name) */
export function useDisplayName() {
  const names = usePeopleStore((s) => s.nicknames);
  return useCallback((username: string | undefined, fallback: string) => (username && names[username]) || fallback, [names]);
}

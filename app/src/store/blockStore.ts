import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BlockState {
  blocked: string[];
  setBlocked: (list: string[]) => void;
  addBlocked: (username: string) => void;
  removeBlocked: (username: string) => void;
  isBlocked: (username: string) => boolean;
}

export const useBlockStore = create<BlockState>()(
  persist(
    (set, get) => ({
      blocked: [],
      setBlocked: (list) => set({ blocked: list }),
      addBlocked: (username) => set(s => ({ blocked: [...s.blocked.filter(u => u !== username), username] })),
      removeBlocked: (username) => set(s => ({ blocked: s.blocked.filter(u => u !== username) })),
      isBlocked: (username) => get().blocked.includes(username),
    }),
    { name: 'block-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);

import { useCallback } from 'react';
import { create } from 'zustand';

interface NicknameState {
  /** username → the name you gave them (only you see it) */
  names: Record<string, string>;
  setAll: (names: Record<string, string>) => void;
}

export const useNicknameStore = create<NicknameState>((set) => ({
  names: {},
  setAll: (names) => set({ names }),
}));

/** `name(username, fallback)`: your nickname for them, else `fallback` (their display name) */
export function useDisplayName() {
  const names = useNicknameStore((s) => s.names);
  return useCallback((username: string | undefined, fallback: string) => (username && names[username]) || fallback, [names]);
}

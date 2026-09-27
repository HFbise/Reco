import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearMessageCache, loadMessageCache } from '../lib/messageCache';

export interface User {
  username: string;
  screenname: string;
  bio: string;
  avatar_expression: string;
  avatar_color: string;
  token: string; // signed session token from login_result; sent in the socket handshake
  guest?: boolean; // read-only demo visitor (see GuestBanner)
}

interface AuthState {
  currentUser: User | null;
  setUser: (user: User) => Promise<void>;
  clearUser: () => Promise<void>;
  loadUser: () => Promise<User | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,

  setUser: async (user) => {
    await AsyncStorage.setItem('currentUser', JSON.stringify(user));
    if (get().currentUser?.username !== user.username) await loadMessageCache(user.username);
    set({ currentUser: user });
  },

  clearUser: async () => {
    await AsyncStorage.removeItem('currentUser');
    await clearMessageCache();
    set({ currentUser: null });
  },

  loadUser: async () => {
    try {
      const raw = await AsyncStorage.getItem('currentUser');
      if (raw) {
        const user = JSON.parse(raw);
        // Sessions saved before token auth existed can't be resumed: log in again
        if (!user?.token) {
          await AsyncStorage.removeItem('currentUser');
          return null;
        }
        await loadMessageCache(user.username);
        set({ currentUser: user });
        return user;
      }
    } catch {
      await AsyncStorage.removeItem('currentUser');
    }
    return null;
  },
}));

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  username: string;
  screenname: string;
  bio: string;
  is_admin: boolean;
  avatar_expression: string;
  avatar_color: string;
  token: string; // signed session token from login_result; sent in the socket handshake
}

interface AuthState {
  currentUser: User | null;
  setUser: (user: User) => Promise<void>;
  clearUser: () => Promise<void>;
  loadUser: () => Promise<User | null>;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,

  setUser: async (user) => {
    await AsyncStorage.setItem('currentUser', JSON.stringify(user));
    set({ currentUser: user });
  },

  clearUser: async () => {
    await AsyncStorage.removeItem('currentUser');
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
        set({ currentUser: user });
        return user;
      }
    } catch {
      await AsyncStorage.removeItem('currentUser');
    }
    return null;
  },
}));

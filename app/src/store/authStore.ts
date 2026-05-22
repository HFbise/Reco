import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  username: string;
  screenname: string;
  bio: string;
  is_admin: boolean;
  avatar_expression: string;
  avatar_color: string;
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
        set({ currentUser: user });
        return user;
      }
    } catch {
      await AsyncStorage.removeItem('currentUser');
    }
    return null;
  },
}));

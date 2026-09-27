import { io, Socket } from 'socket.io-client';
import { router } from 'expo-router';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from './i18n';
import { showAlert } from './alert';

let socket: Socket | null = null;

/** Sign out locally and go to the login screen. */
export async function endSession() {
  disconnectSocket();
  await useAuthStore.getState().clearUser();
  router.replace('/(auth)');
}

const tr = (key: Parameters<typeof t>[1]) => t(useLangStore.getState().lang, key);

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      // Re-read on every (re)connect so a fresh token after login / password change is used
      auth: (cb) => cb({ token: useAuthStore.getState().currentUser?.token }),
    });
    // Token rejected (expired, password changed elsewhere, account renamed or deleted)
    socket.on('session_expired', () => {
      const wasSignedIn = !!useAuthStore.getState().currentUser && !useAuthStore.getState().currentUser?.guest;
      endSession();
      if (wasSignedIn) showAlert(tr('session-expired-title'), tr('session-expired-msg'));
    });
    // Demo visitors tried something that needs an account
    socket.on('guest_read_only', () => showAlert(tr('srv-guest_read_only')));
    socket.on('auth_required', () => {
      if (useAuthStore.getState().currentUser) endSession();
    });
  }
  return socket;
}

export function connectSocket() {
  getSocket().connect();
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

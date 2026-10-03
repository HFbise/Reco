import { Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { router } from 'expo-router';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t } from './i18n';
import { showAlert } from './alert';

let socket: Socket | null = null;

/** Tell the server whether this tab is in the background: a DM then also becomes a push
 *  notification (state.is_watching), since a background tab can't be seen. */
function reportVisibility() {
  if (Platform.OS === 'web' && socket?.connected) socket.emit('page_visibility', { hidden: document.visibilityState === 'hidden' });
}
if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', reportVisibility);

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
    socket.on('connect', reportVisibility);
    // Once a day the server swaps the session token for a fresh one: keep it for next time
    socket.on('session_ready', (data: { username?: string; token?: string }) => {
      const user = useAuthStore.getState().currentUser;
      if (data.token && user && !user.guest && user.username === data.username) {
        useAuthStore.getState().setUser({ ...user, token: data.token });
      }
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

import { io, Socket } from 'socket.io-client';
import { router } from 'expo-router';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';

let socket: Socket | null = null;

async function endSession() {
  disconnectSocket();
  await useAuthStore.getState().clearUser();
  router.replace('/(auth)');
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      // Re-read on every (re)connect so a fresh token after login / password change is used
      auth: (cb) => cb({ token: useAuthStore.getState().currentUser?.token }),
    });
    // Token rejected (expired, password changed elsewhere, account deleted)
    socket.on('session_expired', endSession);
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

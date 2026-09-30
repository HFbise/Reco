import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { disablePush, resumePush } from '../lib/webPush';

// The web's notifications are web push (lib/webPush.ts), not Expo push tokens.
// Metro resolves this file instead of usePushNotifications.ts on web; it must export the same
// names (src/lib/__tests__/platformFiles.test.ts checks), or callers fail only at runtime.

/** Signing out: this browser stops getting the account's notifications. */
export function unregisterPushToken() {
  void disablePush(false);
}

export function usePushNotifications(_onNotificationTap?: (roomName: string) => void) {
  const username = useAuthStore((s) => (s.currentUser && !s.currentUser.guest ? s.currentUser.username : null));

  // Signed in on a browser that already allows notifications: attach it to this account
  useEffect(() => {
    if (username) resumePush();
  }, [username]);

  // A notification clicked while Reco is open: the worker asks the page to go there
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'reco-open' || typeof event.data.path !== 'string') return;
      // The desktop layout opens it in place (DesktopShell); otherwise it's a normal navigation
      const unhandled = window.dispatchEvent(new CustomEvent('reco-open', { detail: event.data.path, cancelable: true }));
      if (unhandled) router.push(event.data.path);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
}

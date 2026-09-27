import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';

// Show notifications while app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// This device's Expo token, remembered so logout can unregister it
let deviceToken: string | null = null;

/** Stop this device receiving the signed-in account's notifications (call before logout). */
export function unregisterPushToken() {
  if (deviceToken) getSocket().emit('unregister_push_token', { token: deviceToken });
}

export function usePushNotifications(onNotificationTap?: (roomName: string) => void) {
  const username = useAuthStore(s => s.currentUser?.username);
  const isGuest = useAuthStore(s => !!s.currentUser?.guest);
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);
  const onTapRef = useRef(onNotificationTap);
  onTapRef.current = onNotificationTap;

  useEffect(() => {
    // Demo guests have no account to notify (and the server would refuse them)
    if (username && !isGuest) registerForPushAsync();
  }, [username, isGuest]);

  useEffect(() => {
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const room = response.notification.request.content.data?.room as string | undefined;
      if (room) onTapRef.current?.(room);
    });

    return () => {
      responseListenerRef.current?.remove();
    };
  }, []);

  async function registerForPushAsync() {
    // Web doesn't support Expo push tokens
    if (Platform.OS === 'web') return;
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    try {
      // Set by `eas init` (app.json → extra.eas.projectId); Expo can't issue tokens without it
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) {
        console.warn('Push disabled: no EAS projectId (run `eas init` in app/)');
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      deviceToken = tokenData.data;
      // Identity comes from the authenticated socket, not from this payload
      if (deviceToken) getSocket().emit('register_push_token', { token: deviceToken, platform: Platform.OS });
    } catch (e) {
      console.warn('Push token error:', e);
    }
  }
}

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
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
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (username) registerForPushAsync();
  }, [username]);

  useEffect(() => {
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const room = response.notification.request.content.data?.room as string | undefined;
      if (room && onNotificationTap) onNotificationTap(room);
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
      const tokenData = await Notifications.getExpoPushTokenAsync();
      deviceToken = tokenData.data;
      // Identity comes from the authenticated socket, not from this payload
      if (deviceToken) getSocket().emit('register_push_token', { token: deviceToken, platform: Platform.OS });
    } catch (e) {
      console.warn('Push token error:', e);
    }
  }
}

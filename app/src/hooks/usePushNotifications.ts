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

export function usePushNotifications(onNotificationTap?: (roomName: string) => void) {
  const { currentUser } = useAuthStore();
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushAsync();

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
      const token = tokenData.data;
      if (token && currentUser?.username) {
        getSocket().emit('register_push_token', {
          username: currentUser.username,
          token,
          platform: Platform.OS,
        });
      }
    } catch (e) {
      console.warn('Push token error:', e);
    }
  }
}

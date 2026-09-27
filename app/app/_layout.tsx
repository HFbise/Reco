import { useEffect, useState } from 'react';
import { View, Platform, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useThemeStore } from '../src/store/themeStore';
import { useLangStore } from '../src/store/langStore';
import { useSoundStore } from '../src/store/soundStore';
import { connectSocket } from '../src/lib/socket';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const scheme = useColorScheme();
  const { loadUser } = useAuthStore();
  const { load: loadTheme } = useThemeStore();
  const { load: loadLang } = useLangStore();
  const { load: loadSound } = useSoundStore();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = document.createElement('style');
    el.textContent = `
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(120,120,120,0.35); border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(120,120,120,0.6); }
      @media (prefers-color-scheme: dark) {
        ::-webkit-scrollbar-thumb { background: rgba(200,200,200,0.25); }
        ::-webkit-scrollbar-thumb:hover { background: rgba(200,200,200,0.45); }
      }
    `;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, []);

  usePushNotifications((room) => {
    if (room) {
      router.push({ pathname: '/(main)/room/[name]', params: { name: room } });
    }
  });

  useEffect(() => {
    Promise.all([
      loadUser().then((user) => { if (user) connectSocket(); }),
      loadTheme(),
      loadLang(),
      loadSound(),
    ]).then(() => setReady(true));
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: scheme === 'dark' ? '#2a2b2f' : '#f0f0f3' }} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(main)" />
    </Stack>
  );
}

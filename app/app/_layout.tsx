import { useEffect, useState } from 'react';
import { View, Platform, useColorScheme } from 'react-native';
import { Stack, router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useThemeStore } from '../src/store/themeStore';
import { useLangStore } from '../src/store/langStore';
import { adoptLegacySoundSetting } from '../src/store/prefsStore';
import { useVolumeStore } from '../src/store/volumeStore';
import { connectSocket } from '../src/lib/socket';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { useColors } from '../src/hooks/useColors';
import { getTheme } from '../src/theme';
import { installErrorReporting } from '../src/lib/errorReporting';
import { CrashScreen } from '../src/components/CrashScreen';

installErrorReporting();

/** Expo Router shows this when a screen throws: a friendly page instead of a blank one */
export function ErrorBoundary(props: { error: Error; retry: () => Promise<void> }) {
  return <CrashScreen {...props} />;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const scheme = useColorScheme();
  const { loadUser } = useAuthStore();
  const { load: loadTheme } = useThemeStore();
  const { load: loadLang } = useLangStore();
  const loadVolumes = useVolumeStore((s) => s.load);

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

  // Installed to the home screen, the phone's status bar takes theme-color (iOS 15+, Android).
  // Follow the app's own light/dark switch, not just the system's, so the bar and the
  // top of the screen are one solid color instead of a white strip.
  const ground = useColors().bg;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = ground;
    document.head.appendChild(meta);
    document.documentElement.style.backgroundColor = ground;
    document.body.style.backgroundColor = ground;
  }, [ground]);

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
      adoptLegacySoundSetting(),
      loadVolumes(),
    ]).then(() => setReady(true));
  }, [loadUser, loadTheme, loadLang, loadVolumes]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: getTheme(scheme === 'dark').bg }} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(main)" />
    </Stack>
  );
}

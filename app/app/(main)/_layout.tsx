import { Stack } from 'expo-router';
import { useIsDesktop } from '../../src/hooks/useIsDesktop';
import { DesktopShell } from '../../src/components/DesktopShell';
import { VoiceProvider } from '../../src/context/VoiceContext';

export default function MainLayout() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DesktopShell />;
  }

  return (
    <VoiceProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="match" options={{ animation: 'none' }} />
        <Stack.Screen name="me" options={{ animation: 'none' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right', gestureEnabled: true }} />
        <Stack.Screen name="room/[name]" options={{ animation: 'slide_from_right', gestureEnabled: true, fullScreenGestureEnabled: true, animationMatchesGesture: true }} />
      </Stack>
    </VoiceProvider>
  );
}

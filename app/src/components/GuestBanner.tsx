import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useAuthStore } from '../store/authStore';
import { disconnectSocket } from '../lib/socket';
import { Fonts, Radius, Spacing } from '../theme';

/** End the read-only demo and open the sign-up form. */
export async function leaveDemoToSignUp() {
  disconnectSocket();
  await useAuthStore.getState().clearUser();
  router.replace({ pathname: '/(auth)', params: { mode: 'register' } });
}

/** Shown instead of the message composer (and on the profile screen) for demo visitors. */
export function GuestBanner() {
  const c = useColors();
  const t = useT();
  return (
    <View style={s.wrap}>
      <View style={[s.bar, { backgroundColor: c.sunnyBg }]}>
        <Text style={[s.text, { color: c.text }]}>{t('demo-banner')}</Text>
        <TouchableOpacity style={[s.btn, { backgroundColor: c.sunny }]} onPress={leaveDemoToSignUp} activeOpacity={0.85}
          accessibilityRole="button">
          <Text style={[s.btnText, { color: c.sunnyText }]}>{t('register')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: 14, borderRadius: Radius.xl },
  text: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: String(Fonts.semibold) as any },
  btn: { height: 38, borderRadius: Radius.md, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
});

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
    <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      <Text style={[s.text, { color: c.textSub }]}>{t('demo-banner')}</Text>
      <TouchableOpacity style={[s.btn, { backgroundColor: c.accent }]} onPress={leaveDemoToSignUp} activeOpacity={0.85}>
        <Text style={s.btnText}>{t('register')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
  btn: { borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: 8 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: String(Fonts.semibold) as any },
});

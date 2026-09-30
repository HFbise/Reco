import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconBell } from '../Icon';
import { Button } from '../ui/Button';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useAuthStore } from '../../store/authStore';
import {
  enablePush, promptAnswered, promptSnoozed, pushStatus, snoozePrompt, type PushStatus,
} from '../../lib/webPush';
import { Fonts, Radius, Spacing } from '../../theme';

/** "Turn on notifications?" at the top of the chat list. The browser's own permission prompt
 *  comes only after "Turn on": asked out of the blue, people block it, and then the site
 *  can never ask again. On an iPhone it explains Add to Home Screen instead. */
export function PushPrompt() {
  const c = useColors();
  const t = useT();
  const signedIn = useAuthStore((s) => !!s.currentUser && !s.currentUser.guest);
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (signedIn && !promptSnoozed()) pushStatus().then(setStatus);
  }, [signedIn]);

  const install = status === 'needs-install';
  if (done || !signedIn || !(install || (status === 'off' && !promptAnswered()))) return null;

  async function turnOn() {
    setBusy(true);
    await enablePush();
    setBusy(false);
    setDone(true);
  }

  function later() {
    snoozePrompt(install ? 30 : 14);
    setDone(true);
  }

  return (
    <View style={[s.card, { backgroundColor: c.accentBg }]}>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: c.surface }]}><IconBell size={18} color={c.accent} /></View>
        <View style={s.text}>
          <Text style={[s.title, { color: c.text }]}>{install ? t('push-ios-title') : t('push-prompt-title')}</Text>
          <Text style={[s.body, { color: c.textSub }]}>{install ? t('push-ios-body') : t('push-prompt-body')}</Text>
        </View>
      </View>
      <View style={s.actions}>
        {install ? (
          <Button label={t('got-it')} variant="quiet" onPress={later} style={s.button} />
        ) : (
          <>
            <Button label={t('not-now')} variant="quiet" onPress={later} style={s.button} />
            <Button label={t('push-turn-on')} onPress={turnOn} busy={busy} style={s.button} />
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: Spacing.md, marginTop: Spacing.sm, marginBottom: Spacing.xs, borderRadius: Radius.lg, padding: 14, gap: 12 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: String(Fonts.heavy) as any },
  body: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 36, paddingHorizontal: 14 },
});

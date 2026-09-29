import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FaceRow } from './ui/FaceRow';
import { Button } from './ui/Button';
import { DisplayText } from './ui/DisplayText';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { reportError } from '../lib/errorReporting';

/** Shown instead of a blank page when a screen crashes; the error is reported once. */
export function CrashScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const c = useColors();
  const t = useT();
  useEffect(() => { reportError(error, 'render'); }, [error]);
  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <FaceRow faces={[{ expression: 'Sad', color: '#9C84EC', size: 72 }]} />
      <DisplayText style={[s.title, { color: c.text }]}>{t('crash-title')}</DisplayText>
      <Text style={[s.sub, { color: c.textSub }]}>{t('crash-sub')}</Text>
      <Button label={t('crash-reload')} onPress={() => { retry().catch(() => {}); }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  title: { fontSize: 26, textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 380, marginBottom: 6 },
});

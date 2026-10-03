import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconPin } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { Pin } from '../../hooks/usePins';
import { useDisplayName } from '../../store/peopleStore';
import { Fonts, Spacing } from '../../theme';

/** Under the chat header: one pinned message at a time. Tapping goes to it, and the bar moves
 *  on to the next pin, so tapping again walks back through them all. */
export function PinnedBar({ pins, onJumpTo }: { pins: Pin[]; onJumpTo: (id: number) => void }) {
  const c = useColors();
  const t = useT();
  const name = useDisplayName();
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [pins.length]);
  if (!pins.length) return null;
  const pin = pins[Math.min(index, pins.length - 1)];
  return (
    <TouchableOpacity
      style={[s.bar, { backgroundColor: c.surface, borderBottomColor: c.border }]}
      activeOpacity={0.8}
      onPress={() => { onJumpTo(pin.id); setIndex((i) => (i + 1) % pins.length); }}
      accessibilityRole="button"
      accessibilityLabel={t('pinned-message')}
    >
      <View style={[s.mark, { backgroundColor: c.accent }]} />
      <IconPin size={14} color={c.accent} />
      <View style={s.body}>
        <Text style={[s.title, { color: c.accentText }]} numberOfLines={1}>
          {pins.length > 1 ? t('pinned-n-of', { n: Math.min(index, pins.length - 1) + 1, total: pins.length }) : t('pinned-message')}
        </Text>
        <Text style={[s.text, { color: c.textSub }]} numberOfLines={1}>
          {name(pin.username, pin.screenname)}: {pin.text || (pin.image ? t('photo') : '')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, paddingVertical: 7, borderBottomWidth: 1 },
  mark: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  text: { fontSize: 13 },
});

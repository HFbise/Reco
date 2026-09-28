import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { IconPlus } from '../Icon';
import { useT } from '../../hooks/useT';
import type { useColors } from '../../hooks/useColors';

/** Floating emoji pill shown above/below a message on desktop when its 😊 button is clicked. */
export function ReactionQuickBar({ style, emojis, c, onSelect, onMore }: {
  style: any;
  emojis: string[];
  c: ReturnType<typeof useColors>;
  onSelect: (emoji: string) => void;
  onMore: () => void;
}) {
  const t = useT();
  return (
    <View style={[rqs.bar, { backgroundColor: c.surface, borderColor: c.border }, style]}>
      {emojis.map(e => <QuickEmoji key={e} emoji={e} onPress={() => onSelect(e)} />)}
      <View style={[rqs.divider, { backgroundColor: c.border }]} />
      <TouchableOpacity style={[rqs.more, { backgroundColor: c.surface2 }]} onPress={onMore} activeOpacity={0.7}
        accessibilityLabel={t('emoji')}>
        <IconPlus size={16} color={c.textSub} />
      </TouchableOpacity>
    </View>
  );
}

/** Grows a little under the pointer, so it's clear which one you're about to pick */
function QuickEmoji({ emoji, onPress }: { emoji: string; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  const web = Platform.OS === 'web' ? { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {};
  return (
    <TouchableOpacity style={rqs.btn} onPress={onPress} activeOpacity={0.7} accessibilityLabel={emoji} {...(web as any)}>
      <Text style={[rqs.emoji, hover && rqs.emojiHover]}>{emoji}</Text>
    </TouchableOpacity>
  );
}

const rqs = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 12,
  },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24, transitionDuration: '120ms', transitionProperty: 'transform' } as any,
  emojiHover: { transform: [{ scale: 1.3 }] },
  divider: { width: 1, height: 24, marginHorizontal: 4 },
  more: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 2 },
});

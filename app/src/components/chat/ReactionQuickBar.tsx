import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { useColors } from '../../hooks/useColors';

/** Floating emoji pill shown above/below a message on desktop when its 😊 button is clicked. */
export function ReactionQuickBar({ style, emojis, c, onSelect, onMore }: {
  style: any;
  emojis: string[];
  c: ReturnType<typeof useColors>;
  onSelect: (emoji: string) => void;
  onMore: () => void;
}) {
  return (
    <View style={[rqs.bar, { backgroundColor: c.surface }, style]}>
      {emojis.map(e => (
        <TouchableOpacity key={e} style={rqs.btn} onPress={() => onSelect(e)} activeOpacity={0.7}>
          <Text style={rqs.emoji}>{e}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[rqs.btn, rqs.moreBtn, { borderLeftColor: c.border }]} onPress={onMore} activeOpacity={0.7}>
        <Text style={[rqs.more, { color: c.textMuted }]}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const rqs = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4, gap: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  btn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  moreBtn: { borderLeftWidth: StyleSheet.hairlineWidth, marginLeft: 2 },
  emoji: { fontSize: 22 },
  more: { fontSize: 17, fontWeight: 'bold' as any },
});

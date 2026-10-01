import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../../hooks/useColors';
import { Fonts } from '../../../theme';

/** The reaction counts under a bubble; tapping one adds or takes back yours. */
export function Reactions({ reactions, me, own, animate, onPress }: {
  reactions: Record<string, string[]>;
  me: string | undefined;
  /** Under your own bubble: lined up on the right */
  own: boolean;
  /** Live (not history): new pills pop in */
  animate: boolean;
  onPress?: (emoji: string) => void;
}) {
  const used = Object.entries(reactions).filter(([, users]) => users.length > 0);
  if (used.length === 0) return null;
  return (
    <View style={[s.row, own && s.rowOwn]}>
      {used.map(([emoji, users]) => (
        <Pill key={emoji} emoji={emoji} count={users.length} mine={users.includes(me ?? '')} animate={animate}
          onPress={() => onPress?.(emoji)} />
      ))}
    </View>
  );
}

/** One count. New ones pop in, and a count going up gives a little bounce. */
function Pill({ emoji, count, mine, animate, onPress }: {
  emoji: string; count: number; mine: boolean; animate: boolean; onPress: () => void;
}) {
  const c = useColors();
  const scale = useRef(new Animated.Value(animate ? 0.4 : 1)).current;
  const before = useRef(count);
  const bounce = () => Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();

  useEffect(() => { if (animate) bounce(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (count > before.current) { scale.setValue(1.3); bounce(); }
    before.current = count;
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[s.pill, mine ? { backgroundColor: c.accentBg, borderColor: c.accent } : { backgroundColor: c.surface2, borderColor: 'transparent' }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={`${emoji} ${count}`}
        accessibilityState={{ selected: mine }}
      >
        <Text style={s.emoji}>{emoji}</Text>
        <Text style={[s.count, { color: mine ? c.accentText : c.textSub }]}>{count}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowOwn: { justifyContent: 'flex-end' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, borderRadius: 14, paddingHorizontal: 10, borderWidth: 1.5 },
  emoji: { fontSize: 14 },
  count: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
});

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { Fonts, Radius, Spacing } from '../../theme';

/** "… is typing" under the last message: three dots that bounce in turn, and who it is. */
export function TypingIndicator({ label }: { label: string }) {
  const c = useColors();
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(beat, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);

  // Each dot rises during its own third of the cycle
  const dot = (i: number) => {
    const start = i / 3;
    const peak = start + 1 / 6;
    const end = Math.min(start + 1 / 3, 1);
    return {
      transform: [{
        translateY: beat.interpolate({ inputRange: [0, start, peak, end, 1], outputRange: [0, 0, -4, 0, 0] }),
      }],
    };
  };

  return (
    <View style={s.row} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <View style={[s.dots, { backgroundColor: c.surface }]}>
        {[0, 1, 2].map((i) => <Animated.View key={i} style={[s.dot, { backgroundColor: c.textMuted }, dot(i)]} />)}
      </View>
      <Text style={[s.text, { color: c.textSub }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 6 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 26, paddingHorizontal: 10, borderRadius: Radius.full },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { flexShrink: 1, fontSize: 13, fontWeight: String(Fonts.bold) as any },
});

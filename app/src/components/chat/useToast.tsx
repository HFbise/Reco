import { useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useColors } from '../../hooks/useColors';

/** A short notice that fades in over the chat and out again ("Copied", "You're muted"...). */
export function useToast() {
  const c = useColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const [text, setText] = useState('');

  function show(next: string) {
    setText(next);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  const element = (
    <Animated.View pointerEvents="none" style={[s.toast, { opacity, backgroundColor: c.text }]}
      accessibilityLiveRegion="polite">
      <Text style={[s.text, { color: c.bg }]}>{text}</Text>
    </Animated.View>
  );
  return { show, element };
}

const s = StyleSheet.create({
  toast: { position: 'absolute', alignSelf: 'center', bottom: 90, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  text: { fontSize: 14, fontWeight: '700' },
});

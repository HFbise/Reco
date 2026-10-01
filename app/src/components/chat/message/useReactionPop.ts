import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * The emoji that pops over a bubble and floats off when you react: from any menu, from a double
 * tap (shown at once, before the server answers), or from your other device. Reactions that were
 * already there when the message first rendered (history) don't pop.
 */
export function useReactionPop(myReactions: string[]) {
  const progress = useRef(new Animated.Value(0)).current;
  const [emoji, setEmoji] = useState('👍');
  const last = useRef({ emoji: '', at: 0 });
  const live = useRef(false);
  useEffect(() => { live.current = true; }, []);

  function pop(next: string) {
    const now = Date.now();
    if (last.current.emoji === next && now - last.current.at < 1200) return; // the server's echo of a pop we showed
    last.current = { emoji: next, at: now };
    setEmoji(next);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }

  const key = myReactions.join('|');
  const before = useRef(key);
  useEffect(() => {
    const had = new Set(before.current.split('|'));
    before.current = key;
    if (!live.current) return;
    const added = key.split('|').find((e) => e && !had.has(e));
    if (added) pop(added);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = {
    opacity: progress.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
    transform: [
      { scale: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.25, 1] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
    ],
  };
  /** live: false while showing history, so reactions already there don't animate either */
  return { emoji, style, pop, live };
}

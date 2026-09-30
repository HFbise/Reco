import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Fonts } from '../../theme';

const ACTION_W = 84;

export interface SwipeAction {
  label: string;
  icon?: ReactNode;
  color: string;
  textColor: string;
  onPress: () => void;
}

interface Props {
  children: ReactNode;
  /** Whether this row is the one showing its actions (only one at a time, owned by the list) */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Left to right as they appear under the row */
  actions: SwipeAction[];
  /** The list's background: the sliding row is painted with it so the action stays hidden underneath */
  background: string;
  /** Off on mouse screens, where rows show their action on hover instead */
  enabled?: boolean;
}

/** A list row that slides left to reveal its actions (like iOS Mail / Messages). */
export function SwipeRow({ children, open, onOpenChange, actions, background, enabled = true }: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const width = ACTION_W * actions.length;
  const state = useRef({ open, onOpenChange, width });
  state.current = { open, onOpenChange, width };

  const settle = (toOpen: boolean) =>
    Animated.spring(x, { toValue: toOpen ? -state.current.width : 0, bounciness: 0, speed: 20, useNativeDriver: true }).start();

  // Another row opened, or the list closed this one
  useEffect(() => { settle(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(PanResponder.create({
    // Only clearly sideways drags: up and down stays a scroll of the list
    onMoveShouldSetPanResponderCapture: (_e, g) =>
      Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (g.dx < 0 || state.current.open),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => {
      const { open: isOpen, width: w } = state.current;
      x.setValue(Math.min(0, Math.max(-w - ACTION_W * 0.3, (isOpen ? -w : 0) + g.dx)));
    },
    onPanResponderRelease: (_e, g) => {
      const { open: isOpen, width: w } = state.current;
      const shouldOpen = g.vx < -0.4 || (g.vx <= 0.4 && (isOpen ? -w : 0) + g.dx < -w / 2);
      settle(shouldOpen);
      if (shouldOpen !== state.current.open) state.current.onOpenChange(shouldOpen);
    },
    onPanResponderTerminate: () => settle(state.current.open),
  })).current;

  if (!enabled) return <>{children}</>;

  return (
    <View style={s.wrap}>
      {/* Hidden until the row moves: the rounded corners would otherwise let their colors peek out */}
      <Animated.View style={[s.actions, {
        width, opacity: x.interpolate({ inputRange: [-6, 0], outputRange: [1, 0], extrapolate: 'clamp' }),
      }]}>
        {actions.map((a) => (
          <TouchableOpacity key={a.label} style={[s.actionBtn, { backgroundColor: a.color }]} onPress={a.onPress}
            activeOpacity={0.8} accessibilityRole="button" focusable={open}
            // Out of reach while covered: screen readers and Tab skip them (aria-hidden is the web's version)
            accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
            {...({ 'aria-hidden': !open } as any)}>
            {a.icon}
            <Text style={[s.actionText, { color: a.textColor }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
      <Animated.View style={[s.front, { backgroundColor: background, transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  actions: { position: 'absolute', top: 0, bottom: 0, right: 0, flexDirection: 'row' },
  actionBtn: { width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  // Opaque, so the action only shows as the row slides away. touch-action: the browser keeps vertical scrolling
  front: { touchAction: 'pan-y' } as any,
});

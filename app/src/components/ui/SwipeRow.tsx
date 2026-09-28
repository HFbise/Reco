import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Fonts } from '../../theme';

const ACTION_W = 84;

interface Props {
  children: ReactNode;
  /** Whether this row is the one showing its action (only one at a time, owned by the list) */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel: string;
  actionIcon?: ReactNode;
  actionColor: string;
  actionTextColor: string;
  onAction: () => void;
  /** The list's background: the sliding row is painted with it so the action stays hidden underneath */
  background: string;
  /** Off on mouse screens, where rows show their action on hover instead */
  enabled?: boolean;
}

/** A list row that slides left to reveal one action (like iOS Mail / Messages). */
export function SwipeRow({
  children, open, onOpenChange, actionLabel, actionIcon, actionColor, actionTextColor, onAction, background, enabled = true,
}: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const state = useRef({ open, onOpenChange });
  state.current = { open, onOpenChange };

  const settle = (toOpen: boolean) =>
    Animated.spring(x, { toValue: toOpen ? -ACTION_W : 0, bounciness: 0, speed: 20, useNativeDriver: true }).start();

  // Another row opened, or the list closed this one
  useEffect(() => { settle(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(PanResponder.create({
    // Only clearly sideways drags: up and down stays a scroll of the list
    onMoveShouldSetPanResponderCapture: (_e, g) =>
      Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (g.dx < 0 || state.current.open),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => {
      const base = state.current.open ? -ACTION_W : 0;
      x.setValue(Math.min(0, Math.max(-ACTION_W * 1.3, base + g.dx)));
    },
    onPanResponderRelease: (_e, g) => {
      const base = state.current.open ? -ACTION_W : 0;
      const shouldOpen = g.vx < -0.4 || (g.vx <= 0.4 && base + g.dx < -ACTION_W / 2);
      settle(shouldOpen);
      if (shouldOpen !== state.current.open) state.current.onOpenChange(shouldOpen);
    },
    onPanResponderTerminate: () => settle(state.current.open),
  })).current;

  if (!enabled) return <>{children}</>;

  return (
    <View style={s.wrap}>
      <View style={[s.action, { backgroundColor: actionColor }]}>
        <TouchableOpacity style={s.actionBtn} onPress={onAction} activeOpacity={0.8} accessibilityRole="button"
          accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
          {actionIcon}
          <Text style={[s.actionText, { color: actionTextColor }]}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={[s.front, { backgroundColor: background, transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  action: { position: 'absolute', top: 0, bottom: 0, right: 0, width: ACTION_W, justifyContent: 'center' },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  // Opaque, so the action only shows as the row slides away. touch-action: the browser keeps vertical scrolling
  front: { touchAction: 'pan-y' } as any,
});

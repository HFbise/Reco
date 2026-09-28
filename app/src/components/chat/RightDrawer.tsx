import { useEffect, useRef, type ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Animated, PanResponder, useWindowDimensions } from 'react-native';
import type { useColors } from '../../hooks/useColors';

/** Panel that slides in from the right (members list on mobile). Push it back to the right to close. */
export function RightDrawer({ onClose, c, children }: { onClose: () => void; c: ReturnType<typeof useColors>; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const DRAWER_W = Math.min(320, Math.round(width * 0.88));
  const translateX = useRef(new Animated.Value(DRAWER_W)).current;

  useEffect(() => {
    Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [translateX]);

  function close() {
    Animated.timing(translateX, { toValue: DRAWER_W, duration: 180, useNativeDriver: true }).start(onClose);
  }

  // Latest width and close() for the responder, which is created once
  const latest = useRef({ DRAWER_W, close });
  latest.current = { DRAWER_W, close };
  const drag = useRef(PanResponder.create({
    // Sideways to the right only; vertical drags keep scrolling the member list
    onMoveShouldSetPanResponderCapture: (_e, g) => g.dx > 10 && g.dx > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => translateX.setValue(Math.max(0, g.dx)),
    onPanResponderRelease: (_e, g) => {
      if (g.dx > latest.current.DRAWER_W * 0.3 || g.vx > 0.5) latest.current.close();
      else Animated.spring(translateX, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, bounciness: 0, useNativeDriver: true }).start(),
  })).current;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} activeOpacity={1} onPress={close} />
        <Animated.View
          style={[s.drawer, { width: DRAWER_W, transform: [{ translateX }], backgroundColor: c.surface }]}
          {...drag.panHandlers}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  drawer: { position: 'absolute', right: 0, top: 0, bottom: 0, touchAction: 'pan-y' } as any,
});

import { useEffect, useRef, type ReactNode } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, Animated } from 'react-native';
import type { useColors } from '../../hooks/useColors';

/** Panel that slides in from the right (members list on mobile). */
export function RightDrawer({ onClose, c, children }: { onClose: () => void; c: ReturnType<typeof useColors>; children: ReactNode }) {
  const DRAWER_W = 230;
  const translateX = useRef(new Animated.Value(DRAWER_W)).current;

  useEffect(() => {
    Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [translateX]);

  function close() {
    Animated.timing(translateX, { toValue: DRAWER_W, duration: 180, useNativeDriver: true }).start(onClose);
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} activeOpacity={1} onPress={close} />
        <Animated.View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: DRAWER_W, transform: [{ translateX }], backgroundColor: c.surface }}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

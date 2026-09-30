import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { Radius } from '../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Desktop dialog width */
  width?: number;
  accessibilityLabel?: string;
}

/** A panel over the app: a bottom sheet on phones (drag it down to close), a centered
 *  dialog on wide screens. Content scrolls inside it. */
export function Sheet({ visible, onClose, children, width = 460, accessibilityLabel }: Props) {
  const c = useColors();
  const isDesktop = useIsDesktop();

  const y = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => { if (visible) y.setValue(0); }, [visible, y]);
  // Only from the handle strip: dragging inside would fight the content's own scrolling
  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 80 || g.vy > 0.5) close.current();
      else Animated.spring(y, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, bounciness: 0, useNativeDriver: true }).start(),
  })).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.overlay, isDesktop ? s.center : s.bottom, { backgroundColor: c.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={accessibilityLabel} />
        {isDesktop ? (
          <View style={[s.dialog, { width, backgroundColor: c.surface }]} accessibilityViewIsModal>{children}</View>
        ) : (
          <Animated.View style={[s.sheet, { backgroundColor: c.surface, transform: [{ translateY: y }] }]} accessibilityViewIsModal>
            <View style={s.handleZone} {...drag.panHandlers}>
              <View style={[s.handle, { backgroundColor: c.border }]} />
            </View>
            {children}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  bottom: { justifyContent: 'flex-end' },
  dialog: { maxHeight: '85%', maxWidth: '100%', borderRadius: Radius.xxl, overflow: 'hidden' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, overflow: 'hidden' },
  handleZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 6, touchAction: 'none' } as any,
  handle: { width: 40, height: 5, borderRadius: 3 },
});

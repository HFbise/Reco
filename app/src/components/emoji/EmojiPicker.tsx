import { useEffect, useRef } from 'react';
import { Animated, Modal, PanResponder, StyleSheet, TouchableOpacity, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { EmojiPanel } from './EmojiPanel';
import { Radius } from '../../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  recent: string[];
  /** Phones: a bottom sheet. Otherwise a card placed by `position` inside the chat. */
  sheet: boolean;
  position?: StyleProp<ViewStyle>;
}

export const POPOVER_W = 360;
export const POPOVER_H = 420;

/** The emoji picker, for the message box and for reactions. */
export function EmojiPicker({ visible, onClose, onSelect, recent, sheet, position }: Props) {
  const c = useColors();
  const t = useT();
  if (!visible) return null;
  if (sheet) return <EmojiSheet onClose={onClose} onSelect={onSelect} recent={recent} />;
  return (
    <>
      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} accessibilityLabel={t('close')} />
      <View style={[s.popover, { backgroundColor: c.surface, borderColor: c.border }, position]}>
        <EmojiPanel onSelect={onSelect} recent={recent} />
      </View>
    </>
  );
}

function EmojiSheet({ onClose, onSelect, recent }: { onClose: () => void; onSelect: (e: string) => void; recent: string[] }) {
  const c = useColors();
  const { height } = useWindowDimensions();
  const sheetH = Math.min(460, Math.round(height * 0.6));
  const y = useRef(new Animated.Value(sheetH)).current;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    Animated.timing(y, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, [y]);

  const dismiss = () => Animated.timing(y, { toValue: sheetH, duration: 180, useNativeDriver: true }).start(() => close.current());

  // Drag the top strip down to dismiss (the grid below keeps its own scrolling)
  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 4,
    onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 80 || g.vy > 0.5) dismiss();
      else Animated.spring(y, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
    },
  })).current;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={[s.overlay, { backgroundColor: c.overlay }]}>
        <TouchableOpacity style={{ flex: 1 }} onPress={dismiss} activeOpacity={1} />
        <Animated.View style={[s.sheet, { height: sheetH, backgroundColor: c.surface, transform: [{ translateY: y }] }]}>
          <View style={s.grab} {...drag.panHandlers}>
            <View style={[s.handle, { backgroundColor: c.border }]} />
          </View>
          <EmojiPanel onSelect={onSelect} recent={recent} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  popover: {
    position: 'absolute', zIndex: 200, width: POPOVER_W, maxWidth: '94%' as any, height: POPOVER_H,
    borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 12,
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, overflow: 'hidden' },
  grab: { height: 22, alignItems: 'center', justifyContent: 'flex-end', touchAction: 'none' } as any,
  handle: { width: 40, height: 5, borderRadius: 3 },
});

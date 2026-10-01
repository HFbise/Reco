import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, PanResponder } from 'react-native';
import type { Message } from './message/types';
import { useColors } from '../../hooks/useColors';
import { IconPencil, IconPlus, IconReply, IconTrash } from '../Icon';
import { useT } from '../../hooks/useT';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props {
  /** The long-pressed message, or null when closed */
  message: Message | null;
  /** When the long-press opened the sheet (Date.now()) */
  openedAt: number;
  quickEmojis: string[];
  canEdit: boolean;
  canRecall: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onMoreEmojis: () => void;
  onEdit: () => void;
  onRecall: () => void;
  onReply: () => void;
}

/** Mobile long-press menu: quick reactions, more emojis, edit, unsend. */
export function MessageActionsSheet(p: Props) {
  const c = useColors();
  const t = useT();

  // Drag the sheet down to dismiss it (the handle on top invites it)
  const y = useRef(new Animated.Value(0)).current;
  const onClose = useRef(p.onClose);
  onClose.current = p.onClose;
  useEffect(() => { if (p.message) y.setValue(0); }, [p.message, y]);
  const drag = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_e, g) => g.dy > 8 && g.dy > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 80 || g.vy > 0.5) onClose.current();
      else Animated.spring(y, { toValue: 0, bounciness: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, bounciness: 0, useNativeDriver: true }).start(),
  })).current;

  return (
    <Modal visible={!!p.message} transparent animationType="fade" onRequestClose={p.onClose}>
      <View style={[s.overlay, { backgroundColor: c.overlay }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
          // The finger lifting from the long-press would otherwise hit the backdrop and close it at once
          onPress={() => { if (Date.now() - p.openedAt >= 400) p.onClose(); }} />
        <Animated.View style={[s.sheet, { backgroundColor: c.surface, transform: [{ translateY: y }] }]} {...drag.panHandlers}>
          <View style={[s.handle, { backgroundColor: c.border }]} />
          <View style={s.reactions}>
            {p.quickEmojis.slice(0, 5).map((e) => (
              <TouchableOpacity key={e} style={[s.emoji, { backgroundColor: c.surface2 }]} onPress={() => p.onReact(e)} activeOpacity={0.7}>
                <Text style={s.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.emoji, { backgroundColor: c.surface2 }]} onPress={p.onMoreEmojis} activeOpacity={0.7}
              accessibilityLabel={t('emoji')}>
              <IconPlus size={20} color={c.textSub} />
            </TouchableOpacity>
          </View>
          <View style={[s.actions, { backgroundColor: c.surface2 }]}>
            <Action label={t('reply')} color={c.text} icon={<IconReply size={18} color={c.text} />} onPress={p.onReply} />
            {(p.canEdit || p.canRecall) && <View style={[s.divider, { backgroundColor: c.border }]} />}
            {(p.canEdit || p.canRecall) && (
              <>
              {p.canEdit && (
                <Action label={t('edit')} color={c.text} icon={<IconPencil size={18} color={c.text} />} onPress={p.onEdit} />
              )}
              {p.canEdit && p.canRecall && <View style={[s.divider, { backgroundColor: c.border }]} />}
              {p.canRecall && (
                <Action label={t('recall')} color={c.danger} icon={<IconTrash size={18} color={c.danger} />} onPress={p.onRecall} />
              )}
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Action({ label, color, icon, onPress }: { label: string; color: string; icon: ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.action} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      {icon}
      <Text style={[s.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, padding: Spacing.lg, paddingBottom: 28, gap: 14,
    touchAction: 'none',
  } as any,
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 2 },
  reactions: { flexDirection: 'row', justifyContent: 'space-between' },
  emoji: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 24 },
  actions: { borderRadius: Radius.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: Spacing.lg },
  actionText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  divider: { height: 1, marginLeft: 46 },
});

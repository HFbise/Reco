import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import type { Message } from '../MessageBubble';
import { useColors } from '../../hooks/useColors';
import { IconPencil, IconPlus, IconTrash } from '../Icon';
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
}

/** Mobile long-press menu: quick reactions, more emojis, edit, unsend. */
export function MessageActionsSheet(p: Props) {
  const c = useColors();
  const t = useT();
  return (
    <Modal visible={!!p.message} transparent animationType="fade" onRequestClose={p.onClose}>
      <View style={[s.overlay, { backgroundColor: c.overlay }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
          // The finger lifting from the long-press would otherwise hit the backdrop and close it at once
          onPress={() => { if (Date.now() - p.openedAt >= 400) p.onClose(); }} />
        <View style={[s.sheet, { backgroundColor: c.surface }]}>
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
          {(p.canEdit || p.canRecall) && (
            <View style={[s.actions, { backgroundColor: c.surface2 }]}>
              {p.canEdit && (
                <Action label={t('edit')} color={c.text} icon={<IconPencil size={18} color={c.text} />} onPress={p.onEdit} />
              )}
              {p.canEdit && p.canRecall && <View style={[s.divider, { backgroundColor: c.border }]} />}
              {p.canRecall && (
                <Action label={t('recall')} color={c.danger} icon={<IconTrash size={18} color={c.danger} />} onPress={p.onRecall} />
              )}
            </View>
          )}
        </View>
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
  sheet: { borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, padding: Spacing.lg, paddingBottom: 28, gap: 14 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 2 },
  reactions: { flexDirection: 'row', justifyContent: 'space-between' },
  emoji: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 24 },
  actions: { borderRadius: Radius.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52, paddingHorizontal: Spacing.lg },
  actionText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  divider: { height: 1, marginLeft: 46 },
});

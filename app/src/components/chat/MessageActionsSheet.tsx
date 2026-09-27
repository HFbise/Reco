import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import type { Message } from '../MessageBubble';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { Fonts, Spacing } from '../../theme';

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
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
          // The finger lifting from the long-press would otherwise hit the backdrop and close it at once
          onPress={() => { if (Date.now() - p.openedAt >= 400) p.onClose(); }} />
        <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          {p.quickEmojis.slice(0, 4).map((e) => (
            <TouchableOpacity key={e} style={s.btn} onPress={() => p.onReact(e)} activeOpacity={0.7}>
              <Text style={s.icon}>{e}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.btn} onPress={p.onMoreEmojis} activeOpacity={0.7}>
            <Text style={s.icon}>＋</Text>
          </TouchableOpacity>
          {p.canEdit && (
            <TouchableOpacity style={s.btn} onPress={p.onEdit} activeOpacity={0.7}>
              <Text style={s.icon}>✏️</Text>
              <Text style={[s.label, { color: c.textMuted }]}>{t('edit')}</Text>
            </TouchableOpacity>
          )}
          {p.canRecall && (
            <TouchableOpacity style={s.btn} onPress={p.onRecall} activeOpacity={0.7}>
              <Text style={s.icon}>🗑</Text>
              <Text style={[s.label, { color: c.danger }]}>{t('recall')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingHorizontal: Spacing.md, paddingBottom: 22 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  icon: { fontSize: 22 },
  label: { fontSize: 11, marginTop: 3, fontWeight: String(Fonts.medium) as any },
});

import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props {
  visible: boolean;
  title: string;
  titleColor?: string;
  onClose: () => void;
  /** Error text shown above the body */
  error?: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  confirmDisabled?: boolean;
  danger?: boolean;
}

/** The dialog used by the account screens: backdrop, card, title, error, Cancel + confirm. */
export function ModalFrame(p: Props) {
  const c = useColors();
  const t = useT();
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={p.onClose}>
      <TouchableOpacity style={s.overlay} onPress={p.onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.box, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <Text style={[s.title, { color: p.titleColor ?? c.text }]}>{p.title}</Text>
          {!!p.error && <Text style={[s.error, { color: c.danger }]}>{p.error}</Text>}
          {p.children}
          <View style={s.buttons}>
            <TouchableOpacity style={[s.btn, s.cancel, { borderColor: c.border }]} onPress={p.onClose}>
              <Text style={[s.cancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: p.danger ? c.danger : c.accent }, (p.busy || p.confirmDisabled) && { opacity: 0.55 }]}
              onPress={p.onConfirm}
              disabled={p.busy || p.confirmDisabled}
              activeOpacity={0.86}
            >
              <Text style={s.confirmText}>{p.busy ? t('saving') : p.confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/** Text input styled for these dialogs. */
export const modalInputStyle = (c: ReturnType<typeof useColors>) =>
  [s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }];

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl },
  box: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 400 },
  title: { fontSize: 17, fontWeight: String(Fonts.bold) as any },
  error: { fontSize: 13 },
  input: { borderRadius: Radius.md, padding: 12, fontSize: 15, borderWidth: 1 },
  buttons: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end', marginTop: Spacing.xs },
  btn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: Radius.md },
  cancel: { borderWidth: 1 },
  cancelText: { fontSize: 14 },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: String(Fonts.semibold) as any },
});

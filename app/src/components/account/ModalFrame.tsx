import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Button } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
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

/** The app's small dialog: backdrop, card, title, error, Cancel + confirm. */
export function ModalFrame(p: Props) {
  const c = useColors();
  const t = useT();
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={p.onClose}>
      <TouchableOpacity style={[s.overlay, { backgroundColor: c.overlay }]} onPress={p.onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.box, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <DisplayText style={[s.title, { color: p.titleColor ?? c.text }]}>{p.title}</DisplayText>
          {!!p.error && (
            <View style={[s.error, { backgroundColor: c.dangerBg }]}>
              <Text style={[s.errorText, { color: c.danger }]}>{p.error}</Text>
            </View>
          )}
          {p.children}
          <View style={s.buttons}>
            <Button label={t('cancel')} variant="quiet" onPress={p.onClose} style={s.button} />
            <Button
              label={p.confirmLabel}
              variant={p.danger ? 'danger' : 'primary'}
              onPress={p.onConfirm}
              busy={p.busy}
              disabled={p.confirmDisabled}
              style={s.button}
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/** Text input styled for these dialogs (prefer ui/TextField for new code). */
export const modalInputStyle = (c: ReturnType<typeof useColors>) =>
  [s.input, { backgroundColor: c.surface2, color: c.text, borderColor: c.border }];

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl },
  box: { borderRadius: Radius.xxl, padding: Spacing.xxl, gap: 14, width: '100%', maxWidth: 420 },
  title: { fontSize: 22 },
  error: { borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  input: { borderRadius: Radius.lg, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, borderWidth: 1.5, outlineStyle: 'none' } as any,
  buttons: { flexDirection: 'row', gap: 10, marginTop: Spacing.xs },
  button: { flexGrow: 1, flexBasis: 0 },
});

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { RoomInfo } from '../../hooks/useRoomChat';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props {
  visible: boolean;
  name: string;
  room: RoomInfo;
  onClose: () => void;
  onLeave: () => void;
  /** Resolves with the server reply; null clears the password */
  onSetPassword: (pw: string | null) => Promise<any>;
  onCopied: () => void;
}

/** Room code, member count, owner password controls and "leave room". */
export function RoomInfoModal({ visible, name, room, onClose, onLeave, onSetPassword, onCopied }: Props) {
  const c = useColors();
  const t = useT();
  const [editingPw, setEditingPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');

  async function togglePassword() {
    if (room.hasPassword) {
      await onSetPassword(null);
      return;
    }
    setEditingPw((v) => !v);
    setError('');
  }

  async function submitPassword() {
    const pw = newPw.trim();
    if (!pw) { setError(t('err-pw-required')); return; }
    const reply = await onSetPassword(pw);
    if (!reply?.success) { setError(t.server(reply, 'err-save-failed')); return; }
    setEditingPw(false);
    setNewPw('');
    setError('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.box, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <Text style={[s.title, { color: c.text }]}># {t.room(name)}</Text>
          {!!room.code && (
            <View style={s.row}>
              <Text style={[s.label, { color: c.textMuted }]}>{t('room-code')}</Text>
              <View style={s.codeRight}>
                <Text selectable style={[s.value, { color: c.text }]}>{room.code}</Text>
                {/* Clipboard access is only wired up on the web; on phones the code is selectable */}
                {Platform.OS === 'web' && (
                  <TouchableOpacity
                    onPress={() => { navigator.clipboard?.writeText(room.code); onCopied(); }}
                    style={[s.copyBtn, { backgroundColor: c.accentBg }]} activeOpacity={0.7}>
                    <Text style={[s.copyText, { color: c.accent }]}>{t('copy')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          <View style={s.row}>
            <Text style={[s.label, { color: c.textMuted }]}>{t('members')}</Text>
            <Text style={[s.value, { color: c.text }]}>{room.memberCount}{t('people-unit') ? ' ' + t('people-unit') : ''}</Text>
          </View>

          {room.isOwner && (
            <View style={s.ownerArea}>
              <TouchableOpacity style={[s.outlineBtn, { borderColor: c.border }]} onPress={togglePassword} activeOpacity={0.8}>
                <Text style={[s.outlineText, { color: c.text }]}>{room.hasPassword ? t('remove-room-pw') : t('set-room-pw')}</Text>
              </TouchableOpacity>
              {editingPw && (
                <View style={s.pwArea}>
                  {!!error && <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text>}
                  <TextInput
                    style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                    placeholder={t('ph-set-room-pw')}
                    placeholderTextColor={c.textMuted}
                    value={newPw}
                    onChangeText={setNewPw}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    onSubmitEditing={submitPassword}
                  />
                  <TouchableOpacity style={[s.solidBtn, { backgroundColor: c.accent }]} onPress={submitPassword} activeOpacity={0.86}>
                    <Text style={s.solidText}>{t('confirm-set-pw')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={[s.solidBtn, { backgroundColor: c.accent }]} onPress={onClose}>
            <Text style={s.solidText}>{t('close')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.outlineBtn, { borderColor: c.danger }]} onPress={onLeave}>
            <Text style={[s.outlineText, { color: c.danger }]}>{t('leave-room')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box: { margin: 40, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, alignSelf: 'center', width: 300 },
  title: { fontSize: 18, fontWeight: String(Fonts.bold) as any },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  codeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  copyText: { fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  ownerArea: { gap: Spacing.sm, width: '100%' },
  pwArea: { gap: Spacing.sm },
  input: { borderRadius: Radius.md, padding: 11, fontSize: 15, borderWidth: 1 },
  solidBtn: { borderRadius: Radius.md, padding: 10, alignItems: 'center', marginTop: Spacing.sm },
  solidText: { color: '#fff', fontWeight: String(Fonts.semibold) as any },
  outlineBtn: { borderRadius: Radius.md, padding: 10, alignItems: 'center', borderWidth: 1, width: '100%' },
  outlineText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
});

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import { showAlert } from '../../lib/alert';
import { LOBBY_ID } from '../../lib/i18n';
import { Button, IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { TextField } from '../ui/TextField';
import { IconClose, IconHash, IconLock, IconLogout, IconTrash, IconUnlock, IconUsers } from '../Icon';
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
  /** Owner only: delete the room for everyone */
  onCloseRoom: () => void;
  /** Resolves with the server reply; null clears the password */
  onSetPassword: (pw: string | null) => Promise<any>;
  onCopied: () => void;
}

/** Room code, member count, owner password controls, and "leave room" (or "close room" for the owner). */
export function RoomInfoModal({ visible, name, room, onClose, onLeave, onCloseRoom, onSetPassword, onCopied }: Props) {
  const c = useColors();
  const t = useT();
  const [editingPw, setEditingPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');

  function confirmCloseRoom() {
    showAlert(t('close-room'), t('close-room-confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('close-room'), style: 'destructive', onPress: onCloseRoom },
    ]);
  }

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
      <TouchableOpacity style={[s.overlay, { backgroundColor: c.overlay }]} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.box, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <View style={s.head}>
            <View style={[s.roomIcon, { backgroundColor: c.accent }]}><IconHash size={22} color={c.onAccent} /></View>
            <DisplayText style={[s.title, { color: c.text }]} numberOfLines={2}>{t.room(name)}</DisplayText>
            <IconButton label={t('close')} onPress={onClose} size={40} round icon={(color) => <IconClose size={16} color={color} />} />
          </View>

          <View style={s.stats}>
            {!!room.code && (
              <View style={[s.stat, { backgroundColor: c.surface2 }]}>
                <Text style={[s.statLabel, { color: c.textSub }]}>{t('room-code')}</Text>
                <View style={s.codeRow}>
                  <DisplayText selectable style={[s.code, { color: c.text }]}>{room.code}</DisplayText>
                  {/* Clipboard access is only wired up on the web; on phones the code is selectable */}
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      onPress={() => { navigator.clipboard?.writeText(room.code); onCopied(); }}
                      style={[s.copyBtn, { backgroundColor: c.accentBg }]} activeOpacity={0.7} accessibilityRole="button">
                      <Text style={[s.copyText, { color: c.accentText }]}>{t('copy')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            <View style={[s.stat, s.statSmall, { backgroundColor: c.surface2 }]}>
              <Text style={[s.statLabel, { color: c.textSub }]}>{t('members')}</Text>
              <View style={s.codeRow}>
                <IconUsers size={18} color={c.textSub} />
                <DisplayText style={[s.code, { color: c.text }]}>{room.memberCount}</DisplayText>
              </View>
            </View>
          </View>

          {room.isOwner && (
            <View style={s.ownerArea}>
              <Button
                label={room.hasPassword ? t('remove-room-pw') : t('set-room-pw')}
                variant="secondary"
                onPress={togglePassword}
                icon={(color) => room.hasPassword ? <IconUnlock size={17} color={color} /> : <IconLock size={15} color={color} />}
              />
              {editingPw && (
                <View style={s.pwArea}>
                  {!!error && <Text style={[s.error, { color: c.danger }]}>{error}</Text>}
                  <TextField
                    placeholder={t('ph-set-room-pw')}
                    value={newPw}
                    onChangeText={setNewPw}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    onSubmitEditing={submitPassword}
                  />
                  <Button label={t('confirm-set-pw')} onPress={submitPassword} />
                </View>
              )}
            </View>
          )}

          {/* The lobby can't be left; an owner closes their room instead of leaving it */}
          {room.isOwner ? (
            <TouchableOpacity style={[s.dangerRow, { backgroundColor: c.dangerBg }]} onPress={confirmCloseRoom}
              activeOpacity={0.8} accessibilityRole="button">
              <IconTrash size={18} color={c.danger} />
              <Text style={[s.dangerText, { color: c.danger }]}>{t('close-room')}</Text>
            </TouchableOpacity>
          ) : name !== LOBBY_ID && (
            <TouchableOpacity style={[s.dangerRow, { backgroundColor: c.dangerBg }]} onPress={onLeave}
              activeOpacity={0.8} accessibilityRole="button">
              <IconLogout size={18} color={c.danger} />
              <Text style={[s.dangerText, { color: c.danger }]}>{t('leave-room')}</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl },
  box: { borderRadius: Radius.xxl, padding: Spacing.xxl, gap: Spacing.lg, width: '100%', maxWidth: 400 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roomIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flexGrow: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  statSmall: { flexGrow: 0, minWidth: 100 },
  statLabel: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 22, letterSpacing: 1 },
  copyBtn: { marginLeft: 'auto', height: 30, paddingHorizontal: 12, borderRadius: Radius.full, justifyContent: 'center' },
  copyText: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  ownerArea: { gap: 10 },
  pwArea: { gap: 10 },
  error: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  dangerRow: { height: 48, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerText: { fontSize: 15, fontWeight: String(Fonts.heavy) as any },
});

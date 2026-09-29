import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TextField } from '../ui/TextField';
import { ModalFrame } from './ModalFrame';
import { AvatarView, EXPRESSIONS, AVATAR_COLORS_LIST } from '../AvatarView';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useAuthStore } from '../../store/authStore';
import { showAlert } from '../../lib/alert';
import { changePassword, deleteAccount, submitFeedback, updateProfile } from '../../lib/account';

interface DialogProps {
  visible: boolean;
  onClose: () => void;
}

/** Reset a dialog's fields each time it opens. */
function useOnOpen(visible: boolean, reset: () => void) {
  useEffect(() => {
    if (visible) reset();
    // reset is recreated every render; only opening should trigger it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
}

/** Change the password, or (hasPassword false: an account made with GitHub or Google) set a first one. */
export function ChangePasswordModal({ visible, onClose, hasPassword = true, onSaved }: DialogProps & {
  hasPassword?: boolean; onSaved?: () => void;
}) {
  const c = useColors();
  const t = useT();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useOnOpen(visible, () => { setOldPw(''); setNewPw(''); setConfirmPw(''); setError(''); });

  async function save() {
    if ((hasPassword && !oldPw) || !newPw || !confirmPw) { setError(t('err-fill-required')); return; }
    if (newPw !== confirmPw) { setError(t('err-password-mismatch')); return; }
    setBusy(true);
    const reply = await changePassword(oldPw, newPw);
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-change-failed')); return; }
    onClose();
    onSaved?.();
    showAlert(hasPassword ? t('password-changed') : t('password-set-done'));
  }

  return (
    <ModalFrame visible={visible} onClose={onClose} title={hasPassword ? t('change-password') : t('set-password')} error={error}
      confirmLabel={t('save')} onConfirm={save} busy={busy}>
      {hasPassword ? (
        <TextField placeholder={t('ph-old-password')} value={oldPw}
          onChangeText={setOldPw} secureTextEntry autoComplete="current-password" textContentType="password" />
      ) : (
        <Text style={{ color: c.textSub, fontSize: 14, lineHeight: 20 }}>{t('set-password-note')}</Text>
      )}
      <TextField placeholder={t('ph-new-password')} value={newPw}
        onChangeText={setNewPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <TextField placeholder={t('ph-confirm-password')} value={confirmPw}
        onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" textContentType="newPassword"
        onSubmitEditing={save} />
    </ModalFrame>
  );
}

export function EditProfileModal({ visible, onClose }: DialogProps) {
  const c = useColors();
  const t = useT();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [screenname, setScreenname] = useState('');
  const [bio, setBio] = useState('');
  const [expression, setExpression] = useState('Smile');
  const [color, setColor] = useState(AVATAR_COLORS_LIST[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useOnOpen(visible, () => {
    setScreenname(currentUser?.screenname ?? '');
    setBio(currentUser?.bio ?? '');
    // Older accounts may hold values the picker (and the server) no longer accept
    const expr = currentUser?.avatar_expression ?? '';
    const col = currentUser?.avatar_color ?? '';
    setExpression((EXPRESSIONS as readonly string[]).includes(expr) ? expr : 'Smile');
    setColor(AVATAR_COLORS_LIST.includes(col) ? col : AVATAR_COLORS_LIST[0]);
    setError('');
  });

  async function save() {
    if (!screenname.trim()) { setError(t('err-name-required')); return; }
    setBusy(true);
    const reply = await updateProfile({ screenname: screenname.trim(), bio: bio.trim(), expression, color });
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-save-failed')); return; }
    onClose();
  }

  return (
    <ModalFrame visible={visible} onClose={onClose} title={t('edit-profile')} error={error}
      confirmLabel={t('save')} onConfirm={save} busy={busy}>
      <View style={s.avatarPicker}>
        <AvatarView expression={expression} color={color} username={currentUser?.username}
          screenname={currentUser?.screenname} size={56} />
        <View style={s.grid}>
          {EXPRESSIONS.map((key) => (
            <TouchableOpacity key={key} style={[s.exprOpt, expression === key && { borderColor: c.accent, backgroundColor: c.accentBg }]}
              onPress={() => setExpression(key)} activeOpacity={0.7}>
              <AvatarView expression={key} color={color} size={38} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.grid}>
          {AVATAR_COLORS_LIST.map((col) => (
            <TouchableOpacity key={col} style={[s.colorDot, { backgroundColor: col, borderColor: color === col ? c.text : 'transparent' }, color === col && s.colorSelected]}
              onPress={() => setColor(col)} activeOpacity={0.7} />
          ))}
        </View>
      </View>
      <Text style={[s.label, { color: c.textMuted }]}>{t('display-name')}</Text>
      <TextField value={screenname} onChangeText={setScreenname} placeholder={t('display-name')}
        maxLength={32} />
      <Text style={[s.label, { color: c.textMuted }]}>{t('bio-label')}</Text>
      <TextField style={s.multiline} value={bio} onChangeText={setBio} placeholder={t('ph-bio')}
        multiline numberOfLines={3} textAlignVertical="top" maxLength={200} />
    </ModalFrame>
  );
}

export function FeedbackModal({ visible, onClose }: DialogProps) {
  const t = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useOnOpen(visible, () => { setText(''); setError(''); });

  async function send() {
    setBusy(true);
    const reply = await submitFeedback(text.trim());
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-save-failed')); return; }
    onClose();
    showAlert(t('feedback-sent'));
  }

  return (
    <ModalFrame visible={visible} onClose={onClose} title={t('feedback-title')} error={error}
      confirmLabel={t('feedback-submit')} onConfirm={send} busy={busy} confirmDisabled={!text.trim()}>
      <TextField style={[s.multiline, { minHeight: 110 }]} placeholder={t('feedback-ph')}
        value={text} onChangeText={setText} multiline maxLength={2000}
        textAlignVertical="top" />
    </ModalFrame>
  );
}

export function DeleteAccountModal({ visible, onClose, hasPassword = true }: DialogProps & { hasPassword?: boolean }) {
  const c = useColors();
  const t = useT();
  const username = useAuthStore((s) => s.currentUser?.username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useOnOpen(visible, () => { setPassword(''); setError(''); });

  async function confirm() {
    if (!password) { setError(t('err-fill-required')); return; }
    setBusy(true);
    const reply = await deleteAccount(password);
    setBusy(false);
    if (!reply.success) setError(t.server(reply, 'err-save-failed'));
  }

  return (
    <ModalFrame visible={visible} onClose={onClose} title={t('confirm-delete-title')} titleColor={c.danger}
      error={error} confirmLabel={t('delete-account')} onConfirm={confirm} busy={busy} danger>
      <Text style={{ color: c.textSub, fontSize: 14, lineHeight: 20 }}>
        {hasPassword ? t('confirm-delete-msg') : t('confirm-delete-msg-username', { username })}
      </Text>
      {/* Without a password of its own, the account is confirmed by typing its username */}
      <TextField placeholder={hasPassword ? t('ph-password') : username}
        value={password} onChangeText={setPassword} secureTextEntry={hasPassword}
        autoComplete={hasPassword ? 'current-password' : 'off'} autoCapitalize="none" autoCorrect={false}
        textContentType={hasPassword ? 'password' : 'none'} onSubmitEditing={confirm} />
    </ModalFrame>
  );
}

const s = StyleSheet.create({
  avatarPicker: { alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  exprOpt: { padding: 3, borderRadius: 26, borderWidth: 2, borderColor: 'transparent' },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  colorSelected: { transform: [{ scale: 1.1 }] },
  label: { fontSize: 13, fontWeight: '800', marginBottom: -6 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});

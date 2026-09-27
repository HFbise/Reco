import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { unregisterPushToken } from '../../src/hooks/usePushNotifications';
import { disconnectSocket, getSocket } from '../../src/lib/socket';
import { AvatarView, EXPRESSIONS, AVATAR_COLORS_LIST } from '../../src/components/AvatarView';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { useThemeStore } from '../../src/store/themeStore';
import { IconSun, IconMoon } from '../../src/components/Icon';
import { Fonts, Radius, Spacing } from '../../src/theme';

export default function MeScreen() {
  const { currentUser, clearUser, setUser } = useAuthStore();
  const c = useColors();
  const t = useT();
  const { isDark, toggle } = useThemeStore();
  const [editing, setEditing] = useState(false);
  const [screenname, setScreenname] = useState('');
  const [bio, setBio] = useState('');
  const [selectedExpr, setSelectedExpr] = useState(currentUser?.avatar_expression || 'Smile');
  const [selectedColor, setSelectedColor] = useState(currentUser?.avatar_color || AVATAR_COLORS_LIST[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);

  async function logout() {
    unregisterPushToken();
    getSocket().emit('user_offline', { username: currentUser?.username });
    disconnectSocket();
    await clearUser();
    router.replace('/(auth)');
  }

  function openEdit() {
    setScreenname(currentUser?.screenname ?? '');
    setBio(currentUser?.bio ?? '');
    setSelectedExpr(currentUser?.avatar_expression || 'Smile');
    setSelectedColor(currentUser?.avatar_color || AVATAR_COLORS_LIST[0]);
    setError('');
    setEditing(true);
  }

  function doSubmitFeedback() {
    const text = feedbackText.trim();
    if (!text) return;
    setFeedbackSending(true);
    const socket = getSocket();
    socket.emit('submit_feedback', { username: currentUser?.username, text });
    socket.once('feedback_result', (data: any) => {
      setFeedbackSending(false);
      if (data.success) {
        setShowFeedback(false);
        setFeedbackText('');
        Alert.alert(t('feedback-sent'));
      }
    });
  }

  function doDeleteAccount() {
    if (!deletePw) { setDeleteError(t('err-fill-required')); return; }
    setDeleting(true);
    const socket = getSocket();
    socket.emit('delete_account', { username: currentUser?.username, password: deletePw });
    socket.once('delete_account_result', async (data: any) => {
      setDeleting(false);
      if (!data.success) { setDeleteError(t.server(data, 'err-change-failed')); return; }
      disconnectSocket();
      await clearUser();
      router.replace('/(auth)');
    });
  }

  function doChangePassword() {
    if (!oldPw || !newPw || !confirmPw) { setPwError(t('err-fill-required')); return; }
    if (newPw !== confirmPw) { setPwError(t('err-password-mismatch')); return; }
    setPwSaving(true);
    const socket = getSocket();
    socket.emit('change_password', { username: currentUser?.username, old_password: oldPw, new_password: newPw });
    socket.once('change_password_result', async (data: any) => {
      setPwSaving(false);
      if (!data.success) { setPwError(t.server(data, 'err-change-failed')); return; }
      // Old tokens are invalidated by the password change; keep this device signed in
      if (data.token) await setUser({ ...useAuthStore.getState().currentUser!, token: data.token });
      setShowChangePw(false);
      Alert.alert(t('password-changed'));
    });
  }

  function saveProfile() {
    if (!screenname.trim()) { setError(t('err-name-required')); return; }
    setSaving(true);
    const socket = getSocket();
    socket.emit('update_profile', {
      username: currentUser?.username,
      screenname: screenname.trim(),
      bio: bio.trim(),
      avatar_expression: selectedExpr,
      avatar_color: selectedColor,
    });
    socket.emit('save_avatar', {
      username: currentUser?.username,
      expression: selectedExpr,
      color: selectedColor,
    });
    socket.once('update_profile_result', async (data: any) => {
      setSaving(false);
      if (!data.success) { setError(t.server(data, 'err-save-failed')); return; }
      await setUser({
        ...currentUser!,
        screenname: screenname.trim(),
        bio: bio.trim(),
        avatar_expression: selectedExpr,
        avatar_color: selectedColor,
      });
      setEditing(false);
    });
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={[s.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Text style={[s.topbarTitle, { color: c.text }]}>{t('my-profile')}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={toggle} style={s.topbarBtn} activeOpacity={0.7}>
          {isDark ? <IconSun size={19} color={c.textMuted} /> : <IconMoon size={19} color={c.textMuted} />}
        </TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <View style={[s.card, { backgroundColor: c.surface }]}>
          <View style={s.cardRow}>
            <AvatarView
              expression={currentUser?.avatar_expression}
              color={currentUser?.avatar_color}
              username={currentUser?.username}
              screenname={currentUser?.screenname}
              size={64}
            />
            <View style={s.info}>
              <Text style={[s.name, { color: c.text }]}>{currentUser?.screenname}</Text>
              <Text style={[s.handle, { color: c.textMuted }]}>@{currentUser?.username}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: c.textMuted }]}>{t('bio-label')}</Text>
          <View style={[s.bioCard, { backgroundColor: c.surface }]}>
            <Text style={[s.bioText, { color: c.text }]}>{currentUser?.bio || t('no-bio')}</Text>
          </View>
        </View>

        <View style={s.bottom}>
          <TouchableOpacity style={[s.editBtn, { backgroundColor: c.accent }]} onPress={openEdit} activeOpacity={0.86}>
            <Text style={s.editBtnText}>{t('edit-profile')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.changePwBtn, { borderColor: c.border }]} onPress={() => { setOldPw(''); setNewPw(''); setConfirmPw(''); setPwError(''); setShowChangePw(true); }} activeOpacity={0.86}>
            <Text style={[s.changePwText, { color: c.text }]}>{t('change-password')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.changePwBtn, { borderColor: c.border }]} onPress={() => { setFeedbackText(''); setShowFeedback(true); }} activeOpacity={0.86}>
            <Text style={[s.changePwText, { color: c.text }]}>{t('feedback-btn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.logoutBtn, { borderColor: c.danger }]} onPress={logout} activeOpacity={0.86}>
            <Text style={[s.logoutText, { color: c.danger }]}>{t('logout')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.deleteBtn, { borderColor: c.danger }]} onPress={() => { setDeletePw(''); setDeleteError(''); setShowDeleteAccount(true); }} activeOpacity={0.86}>
            <Text style={[s.deleteText, { color: c.danger }]}>{t('delete-account')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <BottomTabBar />

      <Modal visible={showChangePw} transparent animationType="fade" onRequestClose={() => setShowChangePw(false)}>
        <TouchableOpacity style={s.cpOverlay} onPress={() => setShowChangePw(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.cpBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.cpTitle, { color: c.text }]}>{t('change-password')}</Text>
            {!!pwError && <Text style={{ color: c.danger, fontSize: 13 }}>{pwError}</Text>}
            <TextInput style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-old-password')} placeholderTextColor={c.textMuted} value={oldPw} onChangeText={setOldPw} secureTextEntry autoComplete="current-password" textContentType="password" />
            <TextInput style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-new-password')} placeholderTextColor={c.textMuted} value={newPw} onChangeText={setNewPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <TextInput style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-confirm-password')} placeholderTextColor={c.textMuted} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <View style={s.cpBtns}>
              <TouchableOpacity style={[s.cpCancel, { borderColor: c.border }]} onPress={() => setShowChangePw(false)}>
                <Text style={[s.cpCancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.editBtn, { opacity: pwSaving ? 0.6 : 1 }]} onPress={doChangePassword} disabled={pwSaving} activeOpacity={0.86}>
                <Text style={s.editBtnText}>{pwSaving ? t('saving') : t('save')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showFeedback} transparent animationType="fade" onRequestClose={() => setShowFeedback(false)}>
        <TouchableOpacity style={s.cpOverlay} onPress={() => setShowFeedback(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.cpBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.cpTitle, { color: c.text }]}>{t('feedback-title')}</Text>
            <TextInput
              style={[s.input, s.bioInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder={t('feedback-ph')}
              placeholderTextColor={c.textMuted}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={2000}
            />
            <View style={s.cpBtns}>
              <TouchableOpacity style={[s.cpCancel, { borderColor: c.border }]} onPress={() => setShowFeedback(false)}>
                <Text style={[s.cpCancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.editBtn, { opacity: feedbackSending || !feedbackText.trim() ? 0.5 : 1 }]}
                onPress={doSubmitFeedback}
                disabled={feedbackSending || !feedbackText.trim()}
                activeOpacity={0.86}
              >
                <Text style={s.editBtnText}>{feedbackSending ? t('saving') : t('feedback-submit')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showDeleteAccount} transparent animationType="fade" onRequestClose={() => setShowDeleteAccount(false)}>
        <TouchableOpacity style={s.cpOverlay} onPress={() => setShowDeleteAccount(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.cpBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.cpTitle, { color: c.danger }]}>{t('confirm-delete-title')}</Text>
            <Text style={[{ color: c.textMuted, fontSize: 13 }]}>{t('confirm-delete-msg')}</Text>
            {!!deleteError && <Text style={{ color: c.danger, fontSize: 13 }}>{deleteError}</Text>}
            <TextInput style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-password')} placeholderTextColor={c.textMuted} value={deletePw} onChangeText={setDeletePw} secureTextEntry autoComplete="current-password" textContentType="password" />
            <View style={s.cpBtns}>
              <TouchableOpacity style={[s.cpCancel, { borderColor: c.border }]} onPress={() => setShowDeleteAccount(false)}>
                <Text style={[s.cpCancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.editBtn, { backgroundColor: c.danger, opacity: deleting ? 0.6 : 1 }]} onPress={doDeleteAccount} disabled={deleting} activeOpacity={0.86}>
                <Text style={s.editBtnText}>{deleting ? t('saving') : t('delete-account')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(false)}>
        <SafeAreaView style={[s.modal, { backgroundColor: c.bg }]}>
          <View style={[s.modalHeader, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={[s.modalCancel, { color: c.textMuted }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('edit-profile')}</Text>
            <TouchableOpacity onPress={saveProfile} disabled={saving}>
              <Text style={[s.modalSave, { color: c.accent }, saving && { opacity: 0.5 }]}>
                {saving ? t('saving') : t('save')}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            {!!error && <Text style={[s.errorText, { color: c.danger }]}>{error}</Text>}

            {/* 头像选择器 */}
            <View style={s.avatarPreview}>
              <AvatarView
                expression={selectedExpr}
                color={selectedColor}
                username={currentUser?.username}
                screenname={currentUser?.screenname}
                size={72}
              />
            </View>

            <Text style={[s.fieldLabel, { color: c.textMuted }]}>{t('select-emoji')}</Text>
            <View style={s.exprGrid}>
              {EXPRESSIONS.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[s.exprOpt, selectedExpr === key && s.exprOptSel]}
                  onPress={() => setSelectedExpr(key)}
                  activeOpacity={0.7}
                >
                  <AvatarView expression={key} color={selectedColor} size={38} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: c.textMuted }]}>{t('select-color')}</Text>
            <View style={s.colorGrid}>
              {AVATAR_COLORS_LIST.map(col => (
                <TouchableOpacity
                  key={col}
                  style={[
                    s.colorDot,
                    { backgroundColor: col },
                    selectedColor === col && { borderWidth: 3, borderColor: '#fff' },
                  ]}
                  onPress={() => setSelectedColor(col)}
                  activeOpacity={0.7}
                />
              ))}
            </View>

            <Text style={[s.fieldLabel, { color: c.textMuted }]}>{t('display-name')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              value={screenname}
              onChangeText={setScreenname}
              placeholder={t('ph-screenname')}
              placeholderTextColor={c.textMuted}
            />
            <Text style={[s.fieldLabel, { color: c.textMuted }]}>{t('bio-label')}</Text>
            <TextInput
              style={[s.input, s.bioInput, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              value={bio}
              onChangeText={setBio}
              placeholder={t('ph-bio')}
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topbar: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  topbarTitle: { fontSize: 17, fontWeight: String(Fonts.semibold) as any },
  topbarBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  card: { margin: Spacing.lg, borderRadius: Radius.lg, padding: Spacing.xl },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  info: { flexDirection: 'column', gap: 3 },
  name: { fontSize: 18, fontWeight: String(Fonts.bold) as any },
  handle: { fontSize: 13 },

  section: { marginHorizontal: Spacing.lg },
  sectionLabel: { fontSize: 12, fontWeight: String(Fonts.semibold) as any, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingLeft: 4 },
  bioCard: { borderRadius: Radius.lg, padding: 14, minHeight: 52 },
  bioText: { fontSize: 14 },

  bottom: { padding: Spacing.lg, paddingTop: Spacing.xl, gap: Spacing.md },
  editBtn: { borderRadius: Radius.lg, padding: 14, alignItems: 'center' },
  editBtnText: { color: '#fff', fontWeight: String(Fonts.semibold) as any, fontSize: 16 },
  changePwBtn: { borderRadius: Radius.lg, padding: 14, alignItems: 'center', borderWidth: 1 },
  changePwText: { fontWeight: String(Fonts.semibold) as any, fontSize: 15 },
  logoutBtn: { borderRadius: Radius.lg, padding: 14, alignItems: 'center', borderWidth: 1 },
  logoutText: { fontWeight: String(Fonts.semibold) as any, fontSize: 15 },
  deleteBtn: { borderRadius: Radius.lg, padding: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  deleteText: { fontWeight: String(Fonts.regular) as any, fontSize: 13 },

  cpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  cpBox: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 400 },
  cpTitle: { fontSize: 17, fontWeight: String(Fonts.bold) as any },
  cpBtns: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end', marginTop: Spacing.xs },
  cpCancel: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1 },
  cpCancelText: { fontSize: 14 },

  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  modalCancel: { fontSize: 15 },
  modalTitle: { fontSize: 16, fontWeight: String(Fonts.semibold) as any },
  modalSave: { fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  modalBody: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 40 },

  avatarPreview: { alignItems: 'center', marginVertical: Spacing.md },

  fieldLabel: { fontSize: 12, fontWeight: String(Fonts.semibold) as any, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: Spacing.sm },

  exprGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exprOpt: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  exprOptSel: { borderColor: '#4f8ef7' },

  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.sm },
  colorDot: { width: 32, height: 32, borderRadius: 16 },

  input: { borderRadius: Radius.md, padding: 13, fontSize: 15, borderWidth: 1 },
  bioInput: { minHeight: 90 },
  errorText: { fontSize: 13 },
});

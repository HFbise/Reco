import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, SafeAreaView, Image, Switch, Alert, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useLangStore } from '../store/langStore';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useVoice } from '../hooks/useVoice';
import Slider from '@react-native-community/slider';
import { disconnectSocket, getSocket } from '../lib/socket';
import { RoomsPanel } from './RoomsPanel';
import { ChatPanel } from './ChatPanel';
import { MembersPanel } from './MembersPanel';
import { StreamPanel } from './StreamPanel';
import { AvatarView, EXPRESSIONS, AVATAR_COLORS_LIST } from './AvatarView';
import { IconLogout, IconSun, IconMoon, IconSettings } from './Icon';
import { ConnectionBanner } from './ConnectionBanner';
import { Fonts, Radius, Spacing } from '../theme';

type Panel = 'welcome' | 'chat' | 'me';

export function DesktopShell() {
  const { currentUser, clearUser, setUser } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { lang, setLang } = useLangStore();
  const c = useColors();
  const t = useT();

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedRoomPw, setSelectedRoomPw] = useState<string | undefined>(undefined);
  const [activeView, setActiveView] = useState<Panel>('welcome');
  const [selectedDmMeta, setSelectedDmMeta] = useState<{ screenname: string; username: string; avatarExpression?: string; avatarColor?: string } | null>(null);

  // Voice — single DM rooms don't have voice, so skip voice for dm: rooms
  const voiceRoom = selectedRoom?.startsWith('dm:') ? '' : (selectedRoom ?? '');
  const voice = useVoice(voiceRoom);

  const [editingProfile, setEditingProfile] = useState(false);
  const [screenname, setScreenname] = useState('');
  const [bio, setBio] = useState('');
  const [profileError, setProfileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedExpr, setSelectedExpr] = useState(currentUser?.avatar_expression || 'Smile');
  const [selectedColor, setSelectedColor] = useState(currentUser?.avatar_color || AVATAR_COLORS_LIST[0]);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'audio'>('general');
  const [audioDevices, setAudioDevices] = useState<{ deviceId: string; label: string; kind: string }[]>([]);
  const [micDeviceId, setMicDeviceIdState] = useState('');
  const [speakerDeviceId, setSpeakerDeviceIdState] = useState('');
  const supportsSinkId = Platform.OS === 'web' && typeof (globalThis as any).HTMLAudioElement !== 'undefined' && typeof ((globalThis as any).HTMLAudioElement.prototype as any).setSinkId === 'function';
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

  useEffect(() => {
    AsyncStorage.multiGet(['micDeviceId', 'speakerDeviceId']).then(pairs => {
      const mic = pairs[0][1] || '';
      const spk = pairs[1][1] || '';
      if (mic) { setMicDeviceIdState(mic); voice.setMicDeviceId(mic); }
      if (spk) { setSpeakerDeviceIdState(spk); voice.setSpeakerDeviceId(spk); }
    });
  }, []);

  async function enumerateAudioDevices() {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices
        .filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || (d.kind === 'audioinput' ? `Microphone ${i + 1}` : `Speaker ${i + 1}`),
          kind: d.kind,
        }))
      );
    } catch {}
  }

  function handleMicChange(id: string) {
    setMicDeviceIdState(id);
    voice.setMicDeviceId(id);
    AsyncStorage.setItem('micDeviceId', id);
  }

  function handleSpeakerChange(id: string) {
    setSpeakerDeviceIdState(id);
    voice.setSpeakerDeviceId(id);
    AsyncStorage.setItem('speakerDeviceId', id);
  }

  function openChangePw() {
    setOldPw(''); setNewPw(''); setConfirmPw(''); setPwError('');
    setShowChangePw(true);
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
      if (!data.success) { setDeleteError(data.msg || t('err-save-failed')); return; }
      setShowDeleteAccount(false);
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
    socket.once('change_password_result', (data: any) => {
      setPwSaving(false);
      if (!data.success) { setPwError(data.msg || t('err-change-failed')); return; }
      setShowChangePw(false);
      Alert.alert(t('password-changed'));
    });
  }

  function selectRoom(name: string, password?: string) {
    setSelectedRoom(name);
    setSelectedRoomPw(password);
    setSelectedDmMeta(null);
    setActiveView('chat');
  }

  function selectDm(dmRoom: string, meta: { screenname: string; username: string; avatarExpression?: string; avatarColor?: string }) {
    setSelectedRoom(dmRoom);
    setSelectedDmMeta(meta);
    setActiveView('chat');
  }

  function openMe() {
    setSelectedRoom(null);
    setActiveView('me');
  }

  async function logout() {
    getSocket().emit('user_offline', { username: currentUser?.username });
    disconnectSocket();
    await clearUser();
    router.replace('/(auth)');
  }

  function openEditProfile() {
    setScreenname(currentUser?.screenname ?? '');
    setBio(currentUser?.bio ?? '');
    setSelectedExpr(currentUser?.avatar_expression || 'Smile');
    setSelectedColor(currentUser?.avatar_color || AVATAR_COLORS_LIST[0]);
    setProfileError('');
    setEditingProfile(true);
  }

  function saveProfile() {
    if (!screenname.trim()) { setProfileError(t('err-name-required')); return; }
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
      if (!data.success) { setProfileError(data.msg || t('err-save-failed')); return; }
      await setUser({
        ...currentUser!,
        screenname: screenname.trim(),
        bio: bio.trim(),
        avatar_expression: selectedExpr,
        avatar_color: selectedColor,
      });
      setEditingProfile(false);
    });
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
      <ConnectionBanner />
      {/* ── 顶栏 ── */}
      <View style={[s.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Image
          source={require('../../assets/reco-logo.png')}
          style={s.topbarLogo}
          tintColor={isDark ? '#fff' : undefined}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.topbarUser} onPress={openMe} activeOpacity={0.8}>
          <AvatarView
            expression={currentUser?.avatar_expression}
            color={currentUser?.avatar_color}
            username={currentUser?.username}
            screenname={currentUser?.screenname}
            size={32}
          />
          <Text style={[s.topbarName, { color: c.text }]}>{currentUser?.screenname}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={toggleTheme} activeOpacity={0.7}>
          {isDark ? <IconSun size={17} color={c.text} /> : <IconMoon size={17} color={c.text} />}
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={() => setShowSettings(true)} activeOpacity={0.7}>
          <IconSettings size={17} color={c.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={logout} activeOpacity={0.7}>
          <IconLogout size={17} color={c.text} />
        </TouchableOpacity>
      </View>

      <View style={s.shell}>
        {/* ── 侧边栏 ── */}
        <View style={[s.sidebar, { backgroundColor: c.surface, borderRightColor: c.border }]}>
          <RoomsPanel
            onRoomSelect={selectRoom}
            onDmSelect={(dm) => selectDm(dm.dm_room, {
              screenname: dm.other_screenname,
              username: dm.other_username,
              avatarExpression: dm.avatar_expression,
              avatarColor: dm.avatar_color,
            })}
            selectedRoom={selectedRoom}
            showSidebarHeader
          />
        </View>

        {/* ── 主区域 ── */}
        <View style={s.main}>
          {activeView === 'welcome' && (
            <View style={[s.welcome, { backgroundColor: c.bg }]}>
              <Text style={[s.welcomeHint, { color: c.textMuted }]}>{t('select-room')}</Text>
            </View>
          )}

          {activeView === 'chat' && selectedRoom && Object.keys(voice.remoteVideoStreams).length > 0 && (
            <StreamPanel
              streams={voice.remoteVideoStreams}
              onClose={voice.closeRemoteVideoStream}
            />
          )}

          {activeView === 'chat' && selectedRoom && (
            <ChatPanel
              key={selectedRoom}
              name={selectedRoom}
              password={selectedRoomPw}
              dmMeta={selectedDmMeta}
              hideVoiceBar
              externalVoice={null}
              onClose={() => { setSelectedRoom(null); setActiveView('welcome'); }}
            />
          )}

          {activeView === 'me' && (
            <View style={[s.meView, { backgroundColor: c.bg }]}>
              <View style={[s.meHeader, { borderBottomColor: c.border }]}>
                <Text style={[s.meTitle, { color: c.text }]}>{t('my-profile')}</Text>
              </View>
              <ScrollView contentContainerStyle={s.meScroll}>
                <View style={[s.meCard, { backgroundColor: c.surface }]}>
                  <AvatarView
                    expression={currentUser?.avatar_expression}
                    color={currentUser?.avatar_color}
                    username={currentUser?.username}
                    screenname={currentUser?.screenname}
                    size={72}
                  />
                  <Text style={[s.meName, { color: c.text }]}>{currentUser?.screenname}</Text>
                  <Text style={[s.meHandle, { color: c.textMuted }]}>@{currentUser?.username}</Text>
                  {currentUser?.is_admin && <Text style={[s.adminBadge, { color: c.accent }]}>🛡 {t('admin')}</Text>}
                </View>

                <View style={s.meSection}>
                  <Text style={[s.meSectionLabel, { color: c.textMuted }]}>{t('bio-label')}</Text>
                  <View style={[s.meBioCard, { backgroundColor: c.surface }]}>
                    <Text style={[s.meBioText, { color: c.text }]}>{currentUser?.bio || t('no-bio')}</Text>
                  </View>
                </View>

                <View style={s.meActions}>
                  <TouchableOpacity style={[s.meEditBtn, { backgroundColor: c.accent }]} onPress={openEditProfile} activeOpacity={0.86}>
                    <Text style={s.meEditBtnText}>{t('edit-profile')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.meLogoutBtn, { borderColor: c.border }]} onPress={() => { setFeedbackText(''); setShowFeedback(true); }} activeOpacity={0.86}>
                    <Text style={[s.meLogoutText, { color: c.text }]}>{t('feedback-btn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.meLogoutBtn, { borderColor: c.danger }]} onPress={logout} activeOpacity={0.86}>
                    <Text style={[s.meLogoutText, { color: c.danger }]}>{t('logout')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.meDeleteBtn, { borderColor: c.danger }]}
                    onPress={() => { setDeletePw(''); setDeleteError(''); setShowDeleteAccount(true); }}
                    activeOpacity={0.86}
                  >
                    <Text style={[s.meDeleteText, { color: c.danger }]}>{t('delete-account')}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── 右侧面板（选中房间时显示，包含语音+成员） ── */}
        {activeView === 'chat' && selectedRoom && !selectedRoom.startsWith('dm:') && (
          <MembersPanel
            room={selectedRoom}
            voice={voice}
            currentUsername={currentUser?.username}
            onOpenDm={(username, screenname, avatarExpression, avatarColor) => {
              const parts = [currentUser?.username ?? '', username].sort();
              const dmRoom = `dm:${parts[0]}:${parts[1]}`;
              selectDm(dmRoom, { screenname, username, avatarExpression, avatarColor });
            }}
          />
        )}
      </View>

      {/* 修改密码弹窗 */}
      <Modal visible={showChangePw} transparent animationType="fade" onRequestClose={() => setShowChangePw(false)}>
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowChangePw(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('change-password')}</Text>
            {!!pwError && <Text style={{ color: c.danger, fontSize: 13 }}>{pwError}</Text>}
            <TextInput style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-old-password')} placeholderTextColor={c.textMuted} value={oldPw} onChangeText={setOldPw} secureTextEntry autoComplete="current-password" textContentType="password" />
            <TextInput style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-new-password')} placeholderTextColor={c.textMuted} value={newPw} onChangeText={setNewPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <TextInput style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} placeholder={t('ph-confirm-password')} placeholderTextColor={c.textMuted} value={confirmPw} onChangeText={setConfirmPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowChangePw(false)}>
                <Text style={[s.cancelBtnText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: c.accent }, pwSaving && { opacity: 0.6 }]} onPress={doChangePassword} disabled={pwSaving} activeOpacity={0.86}>
                <Text style={s.saveBtnText}>{pwSaving ? t('saving') : t('save')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 编辑资料弹窗 */}
      <Modal visible={editingProfile} transparent animationType="fade" onRequestClose={() => setEditingProfile(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: c.surface }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('edit-profile')}</Text>
            {!!profileError && <Text style={[s.modalError, { color: c.danger }]}>{profileError}</Text>}

            {/* 头像预览 + 选择器 */}
            <View style={s.avatarPickerSection}>
              <AvatarView
                expression={selectedExpr}
                color={selectedColor}
                username={currentUser?.username}
                screenname={currentUser?.screenname}
                size={56}
              />
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
              <View style={s.colorGrid}>
                {AVATAR_COLORS_LIST.map(col => (
                  <TouchableOpacity
                    key={col}
                    style={[s.colorDot, { backgroundColor: col }, selectedColor === col && s.colorDotSelected]}
                    onPress={() => setSelectedColor(col)}
                    activeOpacity={0.7}
                  />
                ))}
              </View>
            </View>

            <Text style={[s.fieldLabel, { color: c.textMuted }]}>{t('display-name')}</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              value={screenname}
              onChangeText={setScreenname}
              placeholder={t('display-name')}
              placeholderTextColor={c.textMuted}
            />
            <Text style={[s.fieldLabel, { color: c.textMuted }]}>{t('bio-label')}</Text>
            <TextInput
              style={[s.modalInput, s.bioInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              value={bio}
              onChangeText={setBio}
              placeholder={t('ph-bio')}
              placeholderTextColor={c.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} onPress={() => setEditingProfile(false)}>
                <Text style={[s.cancelText, { color: c.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.55 }]} onPress={saveProfile} disabled={saving}>
                <Text style={s.saveBtnText}>{saving ? t('saving') : t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 反馈弹窗 */}
      <Modal visible={showFeedback} transparent animationType="fade" onRequestClose={() => setShowFeedback(false)}>
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowFeedback(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('feedback-title')}</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border, minHeight: 100, textAlignVertical: 'top' }]}
              placeholder={t('feedback-ph')}
              placeholderTextColor={c.textMuted}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              maxLength={2000}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowFeedback(false)}>
                <Text style={[s.cancelBtnText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, { opacity: feedbackSending || !feedbackText.trim() ? 0.5 : 1 }]}
                onPress={doSubmitFeedback}
                disabled={feedbackSending || !feedbackText.trim()}
                activeOpacity={0.86}
              >
                <Text style={s.saveBtnText}>{feedbackSending ? t('saving') : t('feedback-submit')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 删除账号确认弹窗 */}
      <Modal visible={showDeleteAccount} transparent animationType="fade" onRequestClose={() => setShowDeleteAccount(false)}>
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowDeleteAccount(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('confirm-delete-title')}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>{t('confirm-delete-msg')}</Text>
            {!!deleteError && <Text style={{ color: c.danger, fontSize: 13 }}>{deleteError}</Text>}
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-password')}
              placeholderTextColor={c.textMuted}
              value={deletePw}
              onChangeText={setDeletePw}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowDeleteAccount(false)}>
                <Text style={[s.cancelBtnText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: c.danger }, deleting && { opacity: 0.6 }]}
                onPress={doDeleteAccount}
                disabled={deleting}
                activeOpacity={0.86}
              >
                <Text style={s.saveBtnText}>{deleting ? t('saving') : t('delete-account')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 设置弹窗 */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowSettings(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.settingsBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>⚙️ {t('settings')}</Text>

            {/* Tabs — 通用 / 音频 */}
            <View style={s.settingsTabs}>
              <TouchableOpacity
                style={[s.settingsTabBtn, settingsTab === 'general' && { borderBottomColor: c.accent }]}
                onPress={() => setSettingsTab('general')}
                activeOpacity={0.8}
              >
                <Text style={[s.settingsTabText, { color: settingsTab === 'general' ? c.accent : c.textMuted }]}>{t('tab-general')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.settingsTabBtn, settingsTab === 'audio' && { borderBottomColor: c.accent }]}
                onPress={() => { setSettingsTab('audio'); enumerateAudioDevices(); }}
                activeOpacity={0.8}
              >
                <Text style={[s.settingsTabText, { color: settingsTab === 'audio' ? c.accent : c.textMuted }]}>🎵 {t('tab-audio')}</Text>
              </TouchableOpacity>
            </View>

            {settingsTab === 'general' && (
              <View style={s.settingsPanel}>
                <View style={s.settingRow}>
                  <Text style={[s.settingLabel, { color: c.text }]}>{t('dark-mode')}</Text>
                  <Switch value={isDark} onValueChange={toggleTheme} thumbColor="#fff" trackColor={{ false: '#ccc', true: c.accent }} />
                </View>
                <View style={s.settingRow}>
                  <Text style={[s.settingLabel, { color: c.text }]}>{t('language')}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={[s.langBtn, { borderColor: c.border }, lang === 'zh' && { backgroundColor: c.accent, borderColor: c.accent }]}
                      onPress={() => setLang('zh')}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: lang === 'zh' ? '#fff' : c.textMuted, fontSize: 13, fontWeight: String(600) as any }}>中文</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.langBtn, { borderColor: c.border }, lang === 'en' && { backgroundColor: c.accent, borderColor: c.accent }]}
                      onPress={() => setLang('en')}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: lang === 'en' ? '#fff' : c.textMuted, fontSize: 13, fontWeight: String(600) as any }}>EN</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={s.settingRow}>
                  <Text style={[s.settingLabel, { color: c.text }]}>{t('change-password')}</Text>
                  <TouchableOpacity
                    style={[s.langBtn, { borderColor: c.border }]}
                    onPress={() => { setShowSettings(false); openChangePw(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: String(600) as any }}>→</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {settingsTab === 'audio' && (
              <View style={s.settingsPanel}>
                <Text style={[s.settingLabel, { color: c.text }]}>🎤 {t('settings-mic-label')}</Text>
                <View style={s.sliderRow}>
                  <Slider
                    style={{ flex: 1, height: 32 }}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={voice.micVolume}
                    onValueChange={voice.setMicVolume}
                    minimumTrackTintColor={c.accent}
                    maximumTrackTintColor={c.border}
                  />
                  <Text style={[s.sliderVal, { color: c.textMuted }]}>{Math.round(voice.micVolume)}%</Text>
                </View>
                <Text style={[s.settingLabel, { color: c.text, marginTop: 12 }]}>🔊 {t('settings-speaker-label')}</Text>
                <View style={s.sliderRow}>
                  <Slider
                    style={{ flex: 1, height: 32 }}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={voice.speakerVolume}
                    onValueChange={voice.setSpeakerVolume}
                    minimumTrackTintColor={c.accent}
                    maximumTrackTintColor={c.border}
                  />
                  <Text style={[s.sliderVal, { color: c.textMuted }]}>{Math.round(voice.speakerVolume)}%</Text>
                </View>

                {Platform.OS === 'web' && audioDevices.length > 0 && (() => {
                  const mics = audioDevices.filter(d => d.kind === 'audioinput');
                  const speakers = audioDevices.filter(d => d.kind === 'audiooutput');
                  const selectStyle = {
                    width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 14,
                    backgroundColor: c.isDark ? '#2a2b2f' : '#f0f0f3',
                    color: c.text, border: `1px solid ${c.border}`,
                    outline: 'none', marginTop: 4, cursor: 'pointer',
                  };
                  return (
                    <View style={{ gap: 12, marginTop: 8 }}>
                      {mics.length > 0 && (
                        <View style={{ gap: 4 }}>
                          <Text style={[s.settingLabel, { color: c.textMuted, fontSize: 12 }]}>{t('settings-mic-label')}</Text>
                          {React.createElement('select', {
                            value: micDeviceId,
                            onChange: (e: any) => handleMicChange(e.target.value),
                            style: selectStyle,
                          }, mics.map(d => React.createElement('option', { key: d.deviceId, value: d.deviceId }, d.label)))}
                        </View>
                      )}
                      {supportsSinkId && speakers.length > 0 && (
                        <View style={{ gap: 4 }}>
                          <Text style={[s.settingLabel, { color: c.textMuted, fontSize: 12 }]}>{t('settings-speaker-label')}</Text>
                          {React.createElement('select', {
                            value: speakerDeviceId,
                            onChange: (e: any) => handleSpeakerChange(e.target.value),
                            style: selectStyle,
                          }, speakers.map(d => React.createElement('option', { key: d.deviceId, value: d.deviceId }, d.label)))}
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            )}

            <TouchableOpacity style={[s.saveBtn, { backgroundColor: c.accent, marginTop: 4 }]} onPress={() => setShowSettings(false)}>
              <Text style={s.saveBtnText}>{t('close')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const SIDEBAR_W = 300;

const s = StyleSheet.create({
  root: { flex: 1 },

  topbar: {
    height: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, borderBottomWidth: 1, flexShrink: 0, gap: 6,
  },
  topbarLogo: { height: 24, width: 80 },
  iconBtn: { padding: 5, borderRadius: 6, alignItems: 'center', justifyContent: 'center', opacity: 0.7 },
  topbarUser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topbarName: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },

  shell: { flex: 1, flexDirection: 'row' },

  sidebar: { width: SIDEBAR_W, borderRightWidth: 1, flexDirection: 'column' },

  main: { flex: 1 },

  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeHint: { fontSize: 15 },

  meView: { flex: 1 },
  meHeader: { height: 50, justifyContent: 'center', paddingHorizontal: Spacing.xl, borderBottomWidth: 1 },
  meTitle: { fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  meScroll: { padding: Spacing.xl, gap: Spacing.lg },
  meCard: { borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  meName: { fontSize: 20, fontWeight: String(Fonts.bold) as any },
  meHandle: { fontSize: 13 },
  adminBadge: { fontSize: 12 },
  meSection: { gap: 6 },
  meSectionLabel: { fontSize: 11, fontWeight: String(Fonts.semibold) as any, textTransform: 'uppercase', letterSpacing: 0.5, paddingLeft: 4 },
  meBioCard: { borderRadius: Radius.lg, padding: 14, minHeight: 52 },
  meBioText: { fontSize: 14 },
  meActions: { gap: Spacing.md },
  meEditBtn: { borderRadius: Radius.lg, padding: 14, alignItems: 'center' },
  meEditBtnText: { color: '#fff', fontWeight: String(Fonts.semibold) as any, fontSize: 15 },
  meLogoutBtn: { borderRadius: Radius.lg, padding: 14, alignItems: 'center', borderWidth: 1 },
  meLogoutText: { fontWeight: String(Fonts.semibold) as any, fontSize: 15 },
  meDeleteBtn: { borderRadius: Radius.lg, padding: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  meDeleteText: { fontWeight: String(Fonts.semibold) as any, fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 40 },
  modalBox: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 480 },
  modalTitle: { fontSize: 17, fontWeight: String(Fonts.bold) as any },
  modalError: { fontSize: 13 },

  avatarPickerSection: { alignItems: 'center', gap: Spacing.sm },
  exprGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  exprOpt: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  exprOptSel: { borderColor: '#4f8ef7' },
  colorGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  colorDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 0, borderColor: 'transparent' },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3 },

  fieldLabel: { fontSize: 11, fontWeight: String(Fonts.semibold) as any, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalInput: { borderRadius: Radius.md, padding: 12, fontSize: 15, borderWidth: 1 },
  bioInput: { minHeight: 80 },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end', marginTop: Spacing.xs },
  cancelBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: 5, borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  cancelBtnText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  saveBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: 5 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: String(Fonts.semibold) as any },

  settingsBox: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 420 },
  settingsTabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc', marginBottom: 4 },
  settingsTabBtn: { paddingVertical: 8, paddingHorizontal: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  settingsTabText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  settingsPanel: { gap: Spacing.md, paddingVertical: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  settingLabel: { fontSize: 15 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderVal: { fontSize: 12, width: 36, textAlign: 'right' },
  langBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
});

import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { connectSocket } from '../../src/lib/socket';
import { request } from '../../src/lib/account';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { useLangStore } from '../../src/store/langStore';
import { useThemeStore } from '../../src/store/themeStore';
import { IconMoon, IconSun } from '../../src/components/Icon';
import { BrandMark } from '../../src/components/BrandMark';
import { DisplayText } from '../../src/components/ui/DisplayText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, Radius, Spacing } from '../../src/theme';

type Tab = 'login' | 'register';

// A sleeping free-tier server takes up to a minute to answer the first request
const AUTH_TIMEOUT_MS = 70_000;
const SLOW_AFTER_MS = 4_000;

// Ids understood by the server (utils.SECURITY_QUESTIONS); text comes from i18n
const SECURITY_QUESTIONS = ['birth_city', 'primary_school', 'pet_name', 'mother_maiden_name', 'first_car', 'favorite_teacher'];

export default function AuthScreen() {
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { lang, setLang } = useLangStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [tab, setTab] = useState<Tab>(mode === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [screenname, setScreenname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [secQuestion, setSecQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [secAnswer, setSecAnswer] = useState('');
  const [showQPicker, setShowQPicker] = useState(false);
  const { setUser } = useAuthStore();
  const screennameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const secAnswerRef = useRef<TextInput>(null);
  const forgotNewPwRef = useRef<TextInput>(null);

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotQuestion, setForgotQuestion] = useState('');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotStep, setForgotStep] = useState<'username' | 'answer'>('username');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);

  /** One request at a time, with a spinner, and a "waking up" note if the server is slow. */
  async function ask(event: string, payload: object, resultEvent: string) {
    connectSocket();
    setBusy(true);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    try {
      return await request<any>(event, payload, resultEvent, AUTH_TIMEOUT_MS);
    } finally {
      clearTimeout(timer);
      setBusy(false);
      setSlow(false);
    }
  }

  async function doLogin() {
    if (busy) return;
    if (!username || !password) { setError(t('err-fill-user-pass')); return; }
    setError('');
    const data = await ask('login', { username, password }, 'login_result');
    if (!data.success) { setError(t.server(data, 'srv-server_error')); return; }
    await setUser({
      username: data.username,
      screenname: data.screenname,
      bio: data.bio || '',
      avatar_expression: data.avatar_expression || 'Smile',
      avatar_color: data.avatar_color,
      token: data.token,
    });
    router.replace('/(main)');
  }

  async function viewDemo() {
    if (busy) return;
    setError('');
    const data = await ask('guest_login', {}, 'guest_login_result');
    if (!data.success) { setError(t.server(data, 'srv-server_error')); return; }
    await setUser({
      username: data.username,
      screenname: t('guest-name'),
      bio: '',
      avatar_expression: 'Smile',
      avatar_color: '#9C84EC',
      token: data.token,
      guest: true,
    });
    router.replace('/(main)');
  }

  async function doRegister() {
    if (busy) return;
    if (!username || !screenname || !password || !secAnswer.trim()) { setError(t('err-fill-required')); return; }
    setError('');
    const data = await ask('register', { username, screenname, password, bio: '', security_question: secQuestion, security_answer: secAnswer.trim() }, 'register_result');
    if (!data.success) { setError(t.server(data, 'srv-server_error')); return; }
    showAlert(t('register-success'), t('please-login'));
    setTab('login');
  }

  function openForgot() {
    setForgotUsername('');
    setForgotQuestion('');
    setForgotAnswer('');
    setForgotNewPw('');
    setForgotStep('username');
    setForgotError('');
    setShowForgot(true);
  }

  async function getForgotQuestion() {
    if (!forgotUsername.trim()) { setForgotError(t('err-fill-required')); return; }
    setForgotError('');
    setForgotLoading(true);
    connectSocket();
    const data = await request<any>('get_security_question', { username: forgotUsername.trim() }, 'security_question_result', AUTH_TIMEOUT_MS);
    setForgotLoading(false);
    if (!data.success || !data.question) { setForgotError(t.server(data, 'err-reset-failed')); return; }
    setForgotQuestion(data.question);
    setForgotStep('answer');
  }

  async function doResetPassword() {
    if (!forgotAnswer.trim() || !forgotNewPw.trim()) { setForgotError(t('err-fill-required')); return; }
    setForgotError('');
    setForgotLoading(true);
    const data = await request<any>('reset_password', {
      username: forgotUsername.trim(),
      answer: forgotAnswer.trim(),
      new_password: forgotNewPw.trim(),
    }, 'reset_password_result', AUTH_TIMEOUT_MS);
    setForgotLoading(false);
    if (!data.success) { setForgotError(t.server(data, 'err-reset-failed')); return; }
    setShowForgot(false);
    showAlert(t('password-changed'), t('please-login'));
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.column}>
          <View style={s.brand}>
            <BrandMark size={68} />
            <DisplayText style={[s.logo, { color: c.accent }]}>Reco</DisplayText>
          </View>

          <View style={[s.tabs, { borderColor: c.border, backgroundColor: c.surface }]}>
            <TouchableOpacity style={[s.tab, tab === 'login' && { backgroundColor: c.accent }]} onPress={() => { setTab('login'); setError(''); }}>
              <Text style={[s.tabText, { color: tab === 'login' ? '#fff' : c.textSub }]}>{t('login')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tab, tab === 'register' && { backgroundColor: c.accent }]} onPress={() => { setTab('register'); setError(''); }}>
              <Text style={[s.tabText, { color: tab === 'register' ? '#fff' : c.textSub }]}>{t('register')}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.form}>
            <TextInput
              style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-username')} placeholderTextColor={c.textMuted}
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
              autoComplete="username" textContentType="username"
              returnKeyType="next" blurOnSubmit={false}
              onSubmitEditing={() => (tab === 'register' ? screennameRef : passwordRef).current?.focus()}
            />
            {tab === 'register' && (
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder={t('ph-screenname')} placeholderTextColor={c.textMuted}
                value={screenname} onChangeText={setScreenname}
                autoComplete="name" textContentType="name"
                ref={screennameRef} returnKeyType="next" blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            )}
            <TextInput
              style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-password')} placeholderTextColor={c.textMuted}
              value={password} onChangeText={setPassword} secureTextEntry
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              textContentType={tab === 'login' ? 'password' : 'newPassword'}
              ref={passwordRef} returnKeyType={tab === 'login' ? 'go' : 'next'}
              blurOnSubmit={tab === 'login'}
              onSubmitEditing={() => (tab === 'login' ? doLogin() : secAnswerRef.current?.focus())}
            />
            {tab === 'register' && (
              <>
                <TouchableOpacity
                  style={[s.input, s.qPicker, { backgroundColor: c.surface, borderColor: c.border }]}
                  onPress={() => setShowQPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.qPickerText, { color: c.text }]} numberOfLines={2}>{t.question(secQuestion)}</Text>
                </TouchableOpacity>
                <TextInput
                  style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                  placeholder={t('ph-security-answer')}
                  placeholderTextColor={c.textMuted}
                  value={secAnswer}
                  onChangeText={setSecAnswer}
                  autoComplete="off"
                  ref={secAnswerRef} returnKeyType="go"
                  onSubmitEditing={doRegister}
                />
              </>
            )}
            {!!error && <Text style={[s.error, { color: c.danger }]}>{error}</Text>}
            <TouchableOpacity style={[s.btn, { backgroundColor: c.accent }, busy && { opacity: 0.7 }]}
              onPress={tab === 'login' ? doLogin : doRegister} activeOpacity={0.86} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{tab === 'login' ? t('login') : t('register')}</Text>}
            </TouchableOpacity>
            {slow && <Text style={[s.slowNote, { color: c.textMuted }]}>{t('server-waking')}</Text>}
            {tab === 'login' && (
              <TouchableOpacity onPress={openForgot} activeOpacity={0.7}>
                <Text style={[s.forgotLink, { color: c.textMuted }]}>{t('forgot-password')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.demoBtn, { borderColor: c.border }]} onPress={viewDemo} activeOpacity={0.8} disabled={busy}>
              <Text style={[s.demoBtnText, { color: c.accent }]}>{t('demo-view')} →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* language + theme, available before signing in */}
      <View style={[s.corner, { top: insets.top + Spacing.md }]}>
        <TouchableOpacity onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')} style={[s.cornerBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          activeOpacity={0.7} accessibilityLabel={t('language')}>
          <Text style={[s.cornerText, { color: c.textSub }]}>{lang === 'zh' ? 'EN' : '中文'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleTheme} style={[s.cornerBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          activeOpacity={0.7} accessibilityLabel={t('dark-mode')}>
          {isDark ? <IconSun size={17} color={c.textSub} /> : <IconMoon size={17} color={c.textSub} />}
        </TouchableOpacity>
      </View>

      {/* Security question picker */}
      <Modal visible={showQPicker} transparent animationType="fade" onRequestClose={() => setShowQPicker(false)}>
        <TouchableOpacity style={s.overlay} onPress={() => setShowQPicker(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('security-question')}</Text>
            {SECURITY_QUESTIONS.map(q => (
              <TouchableOpacity
                key={q}
                style={[s.qOption, { borderBottomColor: c.border }, secQuestion === q && { backgroundColor: c.accentBg }]}
                onPress={() => { setSecQuestion(q); setShowQPicker(false); }}
                activeOpacity={0.7}
              >
                <Text style={[s.qOptionText, { color: secQuestion === q ? c.accent : c.text }]}>{t.question(q)}</Text>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Forgot password */}
      <Modal visible={showForgot} transparent animationType="fade" onRequestClose={() => setShowForgot(false)}>
        <TouchableOpacity style={s.overlay} onPress={() => setShowForgot(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('forgot-password')}</Text>
            {!!forgotError && <Text style={[s.error, { color: c.danger }]}>{forgotError}</Text>}

            {forgotStep === 'username' ? (
              <>
                <TextInput
                  style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                  placeholder={t('ph-username')}
                  placeholderTextColor={c.textMuted}
                  value={forgotUsername}
                  onChangeText={setForgotUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={() => { if (!forgotLoading) getForgotQuestion(); }}
                />
                <View style={s.modalBtns}>
                  <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowForgot(false)}>
                    <Text style={[s.cancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.confirmBtn, { backgroundColor: c.accent }, forgotLoading && { opacity: 0.6 }]}
                    onPress={getForgotQuestion}
                    disabled={forgotLoading}
                    activeOpacity={0.86}
                  >
                    <Text style={s.confirmText}>{t('ok')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[s.questionText, { color: c.text }]}>{t.question(forgotQuestion)}</Text>
                <TextInput
                  style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                  placeholder={t('ph-security-answer')}
                  placeholderTextColor={c.textMuted}
                  value={forgotAnswer}
                  onChangeText={setForgotAnswer}
                  returnKeyType="next" blurOnSubmit={false}
                  onSubmitEditing={() => forgotNewPwRef.current?.focus()}
                />
                <TextInput
                  style={[s.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                  placeholder={t('ph-new-password')}
                  placeholderTextColor={c.textMuted}
                  value={forgotNewPw}
                  onChangeText={setForgotNewPw}
                  secureTextEntry
                  autoComplete="new-password" textContentType="newPassword"
                  ref={forgotNewPwRef} returnKeyType="go"
                  onSubmitEditing={() => { if (!forgotLoading) doResetPassword(); }}
                />
                <View style={s.modalBtns}>
                  <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setForgotStep('username')}>
                    <Text style={[s.cancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.confirmBtn, { backgroundColor: c.accent }, forgotLoading && { opacity: 0.6 }]}
                    onPress={doResetPassword}
                    disabled={forgotLoading}
                    activeOpacity={0.86}
                  >
                    <Text style={s.confirmText}>{t('reset-password')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  corner: { position: 'absolute', right: Spacing.lg, flexDirection: 'row', gap: Spacing.sm },
  cornerBtn: { minWidth: 38, height: 34, paddingHorizontal: 10, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cornerText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xxl + 8 },
  column: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  brand: { alignItems: 'center', gap: 10, marginBottom: 36 },
  logo: { fontSize: 42, textAlign: 'center' },
  tabs: { flexDirection: 'row', marginBottom: Spacing.xl, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  tabText: { fontWeight: String(Fonts.semibold) as any, fontSize: 14 },
  form: { gap: Spacing.md },
  input: { borderRadius: Radius.md, padding: 13, fontSize: 15, borderWidth: 1 },
  error: { fontSize: 13 },
  btn: { borderRadius: Radius.md, padding: 13, alignItems: 'center', marginTop: Spacing.xs, minHeight: 46, justifyContent: 'center' },
  slowNote: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  btnText: { color: '#fff', fontWeight: String(Fonts.bold) as any, fontSize: 15 },
  forgotLink: { textAlign: 'center', fontSize: 13 },
  demoBtn: { borderRadius: Radius.md, borderWidth: 1, padding: 11, alignItems: 'center', marginTop: Spacing.lg },
  demoBtnText: { fontWeight: String(Fonts.semibold) as any, fontSize: 14 },
  qPicker: { justifyContent: 'center', minHeight: 48 },
  qPickerText: { fontSize: 15 },
  qOption: { paddingVertical: 13, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  qOptionText: { fontSize: 14 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl },
  modalBox: { width: '100%', maxWidth: 400, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md },
  modalTitle: { fontSize: 17, fontWeight: String(Fonts.bold) as any },
  questionText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end', marginTop: Spacing.xs },
  cancelBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1 },
  cancelText: { fontSize: 14 },
  confirmBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: Radius.md },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: String(Fonts.semibold) as any },
});

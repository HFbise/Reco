import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { showAlert } from '../../src/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { connectSocket } from '../../src/lib/socket';
import { request } from '../../src/lib/account';
import { fetchProviders, PROVIDER_NAMES, signInWith, type Provider } from '../../src/lib/oauth';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { useLangStore } from '../../src/store/langStore';
import { useThemeStore } from '../../src/store/themeStore';
import { IconArrowRight, IconCheck, IconChevronDown, IconMoon, IconSun } from '../../src/components/Icon';
import { ExprSvg } from '../../src/components/AvatarView';
import { Button } from '../../src/components/ui/Button';
import { TextField } from '../../src/components/ui/TextField';
import { ModalFrame } from '../../src/components/account/ModalFrame';
import { BrandMark } from '../../src/components/BrandMark';
import { ProviderMark } from '../../src/components/BrandIcons';
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
  // oauth_error: sent back here by the /oauth screen when GitHub / Google sign-in didn't work
  const { mode, oauth_error } = useLocalSearchParams<{ mode?: string; oauth_error?: string }>();
  const [tab, setTab] = useState<Tab>(mode === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [screenname, setScreenname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(oauth_error ? t.server({ code: oauth_error }, 'srv-server_error') : '');
  const [providers, setProviders] = useState<Provider[]>([]);
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

  useEffect(() => { fetchProviders().then(setProviders); }, []);

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

  const brand = c.isDark ? c.accentText : c.accent;

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* scattered faces, decoration only */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {DECO.map((d) => (
          <View key={d.expression} style={[s.deco, d.pos, { transform: [{ rotate: d.rotate }] }]}>
            <ExprSvg expression={d.expression} width={d.size} height={Math.round(d.size * 15 / 14)} color={brand} />
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.column}>
          <View style={s.brand}>
            <BrandMark size={76} />
            <DisplayText style={[s.logo, { color: brand }]}>Reco</DisplayText>
            <Text style={[s.tagline, { color: c.textSub }]}>{t('tagline')}</Text>
          </View>

          <View style={[s.tabs, { backgroundColor: c.surface2 }]} accessibilityRole="tablist">
            {(['login', 'register'] as const).map((value) => {
              const on = tab === value;
              return (
                <TouchableOpacity key={value} onPress={() => { setTab(value); setError(''); }} activeOpacity={0.8}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={[s.tab, on && s.tabOn, on && { backgroundColor: c.surface }]}>
                  <Text style={[s.tabText, { color: on ? c.text : c.textSub }, on && s.tabTextOn]}>{t(value)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.form}>
            <TextField
              placeholder={t('ph-username')}
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
              autoComplete="username" textContentType="username"
              returnKeyType="next" blurOnSubmit={false}
              onSubmitEditing={() => (tab === 'register' ? screennameRef : passwordRef).current?.focus()}
            />
            {tab === 'register' && (
              <TextField
                placeholder={t('ph-screenname')}
                value={screenname} onChangeText={setScreenname}
                autoComplete="name" textContentType="name"
                ref={screennameRef} returnKeyType="next" blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            )}
            <TextField
              placeholder={t('ph-password')}
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
                  style={[s.qPicker, { backgroundColor: c.surface, borderColor: c.border }]}
                  onPress={() => setShowQPicker(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('security-question')}: ${t.question(secQuestion)}`}
                >
                  <View style={s.qPickerText}>
                    <Text style={[s.qLabel, { color: c.textMuted }]}>{t('security-question')}</Text>
                    <Text style={[s.qValue, { color: c.text }]} numberOfLines={2}>{t.question(secQuestion)}</Text>
                  </View>
                  <IconChevronDown size={18} color={c.textSub} />
                </TouchableOpacity>
                <TextField
                  placeholder={t('ph-security-answer')}
                  value={secAnswer}
                  onChangeText={setSecAnswer}
                  autoComplete="off"
                  ref={secAnswerRef} returnKeyType="go"
                  onSubmitEditing={doRegister}
                />
              </>
            )}
            {!!error && (
              <View style={[s.error, { backgroundColor: c.dangerBg }]}>
                <Text style={[s.errorText, { color: c.danger }]}>{error}</Text>
              </View>
            )}
            <Button size="lg" label={tab === 'login' ? t('login') : t('register')} busy={busy}
              onPress={tab === 'login' ? doLogin : doRegister} style={s.primary} />
            {slow && <Text style={[s.slowNote, { color: c.textSub }]}>{t('server-waking')}</Text>}
            {tab === 'login' && (
              <TouchableOpacity onPress={openForgot} activeOpacity={0.7} style={s.forgot}>
                <Text style={[s.forgotText, { color: brand }]}>{t('forgot-password')}</Text>
              </TouchableOpacity>
            )}

            <View style={s.divider}>
              <View style={[s.rule, { backgroundColor: c.border }]} />
              <Text style={[s.or, { color: c.textMuted }]}>{t('or')}</Text>
              <View style={[s.rule, { backgroundColor: c.border }]} />
            </View>

            {providers.map((p) => (
              <Button key={p} variant="quiet" size="lg" disabled={busy} onPress={() => signInWith(p)}
                label={t('continue-with', { provider: PROVIDER_NAMES[p] })}
                icon={(color) => <ProviderMark provider={p} color={color} size={20} />} />
            ))}

            <TouchableOpacity style={[s.demo, { borderColor: brand, backgroundColor: c.surface }]} onPress={viewDemo}
              activeOpacity={0.8} disabled={busy} accessibilityRole="button">
              <Text style={[s.demoText, { color: brand }]}>{t('demo-view')}</Text>
              <IconArrowRight size={18} color={brand} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* language + theme, available before signing in */}
      <View style={[s.corner, { top: insets.top + Spacing.lg }]}>
        <TouchableOpacity onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')} style={[s.langBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          activeOpacity={0.7} accessibilityLabel={t('language')}>
          <Text style={[s.cornerText, { color: c.textSub }]}>{lang === 'zh' ? 'EN' : '中文'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleTheme} style={[s.themeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
          activeOpacity={0.7} accessibilityLabel={t('dark-mode')}>
          {isDark ? <IconSun size={18} color={c.textSub} /> : <IconMoon size={18} color={c.textSub} />}
        </TouchableOpacity>
      </View>

      {/* Security question picker */}
      <Modal visible={showQPicker} transparent animationType="fade" onRequestClose={() => setShowQPicker(false)}>
        <TouchableOpacity style={[s.overlay, { backgroundColor: c.overlay }]} onPress={() => setShowQPicker(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <DisplayText style={[s.sheetTitle, { color: c.text }]}>{t('security-question')}</DisplayText>
            {SECURITY_QUESTIONS.map(q => {
              const on = secQuestion === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[s.qOption, on && { backgroundColor: c.accentBg }]}
                  onPress={() => { setSecQuestion(q); setShowQPicker(false); }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[s.qOptionText, { color: on ? c.accentText : c.text }]}>{t.question(q)}</Text>
                  {on && <IconCheck size={16} color={c.accent} />}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Forgot password: username first, then their question and a new password */}
      <ModalFrame
        visible={showForgot}
        title={t('forgot-password')}
        onClose={() => setShowForgot(false)}
        error={forgotError}
        confirmLabel={forgotStep === 'username' ? t('ok') : t('reset-password')}
        onConfirm={() => { if (!forgotLoading) { if (forgotStep === 'username') getForgotQuestion(); else doResetPassword(); } }}
        busy={forgotLoading}
      >
        {forgotStep === 'username' ? (
          <TextField
            placeholder={t('ph-username')}
            value={forgotUsername}
            onChangeText={setForgotUsername}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => { if (!forgotLoading) getForgotQuestion(); }}
          />
        ) : (
          <>
            <Text style={[s.questionText, { color: c.text }]}>{t.question(forgotQuestion)}</Text>
            <TextField
              placeholder={t('ph-security-answer')}
              value={forgotAnswer}
              onChangeText={setForgotAnswer}
              returnKeyType="next" blurOnSubmit={false}
              onSubmitEditing={() => forgotNewPwRef.current?.focus()}
            />
            <TextField
              placeholder={t('ph-new-password')}
              value={forgotNewPw}
              onChangeText={setForgotNewPw}
              secureTextEntry
              autoComplete="new-password" textContentType="newPassword"
              ref={forgotNewPwRef} returnKeyType="go"
              onSubmitEditing={() => { if (!forgotLoading) doResetPassword(); }}
            />
          </>
        )}
      </ModalFrame>
    </KeyboardAvoidingView>
  );
}

// Faces scattered around the login screen: expression, size, tilt, position
const DECO = [
  { expression: 'Laugh', size: 64, rotate: '-14deg', pos: { left: -14, top: '14%' } },
  { expression: 'BigLaugh', size: 54, rotate: '12deg', pos: { right: -10, top: '38%' } },
  { expression: 'Em', size: 48, rotate: '8deg', pos: { left: 22, bottom: 36 } },
  { expression: 'Smile', size: 40, rotate: '-10deg', pos: { right: 30, bottom: 90 } },
] as const;

const s = StyleSheet.create({
  container: { flex: 1 },
  deco: { position: 'absolute', opacity: 0.14 },
  corner: { position: 'absolute', right: Spacing.lg, flexDirection: 'row', gap: Spacing.sm },
  langBtn: { height: 40, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  themeBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cornerText: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 76, paddingBottom: 40 },
  column: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 22 },
  brand: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 44, lineHeight: 50, textAlign: 'center' },
  tagline: { fontSize: 15, textAlign: 'center' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: Radius.full },
  tab: { flex: 1, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  tabOn: { shadowColor: '#161A23', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  tabTextOn: { fontWeight: String(Fonts.heavy) as any },
  form: { gap: 14 },
  error: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  errorText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  primary: { marginTop: 2 },
  slowNote: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  forgot: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  forgotText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  rule: { flex: 1, height: 1 },
  or: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  demo: {
    height: 52, borderRadius: 18, borderWidth: 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  demoText: { fontSize: 16, fontWeight: String(Fonts.heavy) as any },
  qPicker: {
    minHeight: 60, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  qPickerText: { flex: 1, gap: 2 },
  qLabel: { fontSize: 12, fontWeight: String(Fonts.bold) as any },
  qValue: { fontSize: 16 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xxl },
  sheet: { width: '100%', maxWidth: 420, borderRadius: Radius.xxl, padding: Spacing.xl, gap: 4 },
  sheetTitle: { fontSize: 22, marginBottom: Spacing.sm, paddingHorizontal: 8 },
  qOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: Radius.md },
  qOptionText: { flex: 1, fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  questionText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
});

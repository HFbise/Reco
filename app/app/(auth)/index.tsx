import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { getSocket, connectSocket } from '../../src/lib/socket';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { Fonts, Radius, Spacing } from '../../src/theme';

type Tab = 'login' | 'register';

const SECURITY_QUESTIONS = [
  '你的出生城市是？',
  '你的小学名字是？',
  '你最喜欢的宠物名字是？',
  '你母亲的娘家姓是？',
  '你的第一辆车的品牌是？',
  '你最喜欢的老师叫什么？',
];

export default function AuthScreen() {
  const c = useColors();
  const t = useT();
  const [tab, setTab] = useState<Tab>('login');
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

  function doLogin() {
    if (!username || !password) { setError(t('err-fill-user-pass')); return; }
    setError('');
    connectSocket();
    const socket = getSocket();
    socket.emit('login', { username, password });
    socket.once('login_result', async (data: any) => {
      if (!data.success) { setError(data.msg); return; }
      await setUser({
        username: data.username,
        screenname: data.screenname,
        bio: data.bio || '',
        avatar_expression: data.avatar_expression || 'Smile',
        avatar_color: data.avatar_color,
        token: data.token,
      });
      router.replace('/(main)');
    });
  }

  function doRegister() {
    if (!username || !screenname || !password || !secAnswer.trim()) { setError(t('err-fill-required')); return; }
    setError('');
    connectSocket();
    const socket = getSocket();
    socket.emit('register', { username, screenname, password, bio: '', security_question: secQuestion, security_answer: secAnswer.trim() });
    socket.once('register_result', (data: any) => {
      if (!data.success) { setError(data.msg); return; }
      Alert.alert(t('register-success'), t('please-login'));
      setTab('login');
    });
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

  function getForgotQuestion() {
    if (!forgotUsername.trim()) { setForgotError(t('err-fill-required')); return; }
    setForgotError('');
    setForgotLoading(true);
    connectSocket();
    const socket = getSocket();
    socket.emit('get_security_question', { username: forgotUsername.trim() });
    socket.once('security_question_result', (data: any) => {
      setForgotLoading(false);
      if (!data.success || !data.question) { setForgotError(data.msg || t('err-reset-failed')); return; }
      setForgotQuestion(data.question);
      setForgotStep('answer');
    });
  }

  function doResetPassword() {
    if (!forgotAnswer.trim() || !forgotNewPw.trim()) { setForgotError(t('err-fill-required')); return; }
    setForgotError('');
    setForgotLoading(true);
    const socket = getSocket();
    socket.emit('reset_password', {
      username: forgotUsername.trim(),
      answer: forgotAnswer.trim(),
      new_password: forgotNewPw.trim(),
    });
    socket.once('reset_password_result', (data: any) => {
      setForgotLoading(false);
      if (!data.success) { setForgotError(data.msg || t('err-reset-failed')); return; }
      setShowForgot(false);
      Alert.alert(t('password-changed'), t('please-login'));
    });
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.column}>
          <Text style={[s.logo, { color: c.accent }]}>Reco</Text>

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
                  <Text style={[s.qPickerText, { color: c.text }]} numberOfLines={2}>{secQuestion}</Text>
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
            <TouchableOpacity style={[s.btn, { backgroundColor: c.accent }]} onPress={tab === 'login' ? doLogin : doRegister} activeOpacity={0.86}>
              <Text style={s.btnText}>{tab === 'login' ? t('login') : t('register')}</Text>
            </TouchableOpacity>
            {tab === 'login' && (
              <TouchableOpacity onPress={openForgot} activeOpacity={0.7}>
                <Text style={[s.forgotLink, { color: c.textMuted }]}>{t('forgot-password')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* 安全问题选择器 */}
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
                <Text style={[s.qOptionText, { color: secQuestion === q ? c.accent : c.text }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 忘记密码弹窗 */}
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
                <Text style={[s.questionText, { color: c.text }]}>{forgotQuestion}</Text>
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xxl + 8 },
  column: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  logo: { fontSize: 36, fontWeight: String(Fonts.heavy) as any, textAlign: 'center', marginBottom: 40 },
  tabs: { flexDirection: 'row', marginBottom: Spacing.xl, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center' },
  tabText: { fontWeight: String(Fonts.semibold) as any, fontSize: 14 },
  form: { gap: Spacing.md },
  input: { borderRadius: Radius.md, padding: 13, fontSize: 15, borderWidth: 1 },
  error: { fontSize: 13 },
  btn: { borderRadius: Radius.md, padding: 13, alignItems: 'center', marginTop: Spacing.xs },
  btnText: { color: '#fff', fontWeight: String(Fonts.bold) as any, fontSize: 15 },
  forgotLink: { textAlign: 'center', fontSize: 13 },
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

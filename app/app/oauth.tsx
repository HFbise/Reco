import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { connectSocket } from '../src/lib/socket';
import { request } from '../src/lib/account';
import { showAlert } from '../src/lib/alert';
import { PROVIDER_NAMES, takeReturnParams, type Provider } from '../src/lib/oauth';
import { useColors } from '../src/hooks/useColors';
import { useT } from '../src/hooks/useT';
import { BrandMark } from '../src/components/BrandMark';
import { Button } from '../src/components/ui/Button';
import { DisplayText } from '../src/components/ui/DisplayText';
import { TextField } from '../src/components/ui/TextField';
import { Fonts, Radius } from '../src/theme';

const TIMEOUT_MS = 30_000;

interface Signup { ticket: string; provider: Provider; username: string; screenname: string }

/** Where GitHub / Google send the browser back (via the server's callback, see oauth.py).
 *  Signs in, asks a new user for a username, or reports a connected account. */
export default function OAuthReturn() {
  const c = useColors();
  const t = useT();
  const setUser = useAuthStore((s) => s.setUser);
  const [signup, setSignup] = useState<Signup | null>(null);
  const [username, setUsername] = useState('');
  const [screenname, setScreenname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  async function signedIn(data: any) {
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

  useEffect(() => {
    if (handled.current) return; // effects can run twice in development
    handled.current = true;
    const params = takeReturnParams();
    const account = useAuthStore.getState().currentUser;
    // Connecting a provider from the profile page comes back here too
    const fromProfile = !!account && !account.guest;

    if (params.login) {
      connectSocket();
      request('oauth_login', { ticket: params.login }, 'oauth_login_result', TIMEOUT_MS).then((data) => {
        if (data.success) signedIn(data);
        else router.replace({ pathname: '/(auth)', params: { oauth_error: data.code || 'server_error' } });
      });
    } else if (params.signup) {
      const provider = (params.provider in PROVIDER_NAMES ? params.provider : 'github') as Provider;
      setSignup({ ticket: params.signup, provider, username: params.username ?? '', screenname: params.screenname ?? '' });
      setUsername(params.username ?? '');
      setScreenname(params.screenname ?? '');
    } else if (params.linked && fromProfile) {
      router.replace('/me');
      const name = PROVIDER_NAMES[params.linked as Provider] ?? params.linked;
      showAlert(t('oauth-linked', { provider: name }));
    } else {
      const code = params.error || 'oauth_expired';
      if (fromProfile) {
        router.replace('/me');
        showAlert(t.server({ code }, 'srv-server_error'));
      } else {
        router.replace({ pathname: '/(auth)', params: { oauth_error: code } });
      }
    }
    // Runs once: the params are taken out of the address bar as they're read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!signup || busy) return;
    if (!username.trim() || !screenname.trim()) { setError(t('err-fill-required')); return; }
    setError('');
    setBusy(true);
    connectSocket();
    const data = await request('oauth_register', {
      ticket: signup.ticket, username: username.trim(), screenname: screenname.trim(),
    }, 'oauth_register_result', TIMEOUT_MS);
    setBusy(false);
    if (data.success) signedIn(data);
    else setError(t.server(data, 'srv-server_error'));
  }

  if (!signup) {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <BrandMark size={64} />
        <ActivityIndicator color={c.accent} />
        <Text style={[s.note, { color: c.textSub }]}>{t('oauth-signing-in')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.column}>
          <View style={s.head}>
            <BrandMark size={64} />
            <DisplayText style={[s.title, { color: c.text }]}>{t('oauth-pick-title')}</DisplayText>
            <Text style={[s.note, { color: c.textSub }]}>{t('oauth-pick-sub', { provider: PROVIDER_NAMES[signup.provider] })}</Text>
          </View>
          <View style={s.form}>
            <View style={s.field}>
              <Text style={[s.label, { color: c.textSub }]}>{t('ph-username')}</Text>
              <TextField value={username} onChangeText={setUsername} placeholder={t('ph-username')}
                autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" />
              <Text style={[s.hint, { color: c.textMuted }]}>{t('username-hint')}</Text>
            </View>
            <View style={s.field}>
              <Text style={[s.label, { color: c.textSub }]}>{t('ph-screenname')}</Text>
              <TextField value={screenname} onChangeText={setScreenname} placeholder={t('ph-screenname')}
                autoComplete="name" textContentType="name" returnKeyType="go" onSubmitEditing={create} />
            </View>
            {!!error && (
              <View style={[s.error, { backgroundColor: c.dangerBg }]}>
                <Text style={[s.errorText, { color: c.danger }]}>{error}</Text>
              </View>
            )}
            <Button size="lg" label={t('oauth-create')} busy={busy} onPress={create} />
            <TouchableOpacity onPress={() => router.replace('/(auth)')} activeOpacity={0.7} style={s.back}>
              <Text style={[s.backText, { color: c.isDark ? c.accentText : c.accent }]}>{t('oauth-back')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 28 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  column: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 24 },
  head: { alignItems: 'center', gap: 10 },
  title: { fontSize: 30, lineHeight: 36, textAlign: 'center' },
  note: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  form: { gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: String(Fonts.bold) as any, marginLeft: 4 },
  hint: { fontSize: 12, marginLeft: 4 },
  error: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  errorText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  back: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  backText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
});

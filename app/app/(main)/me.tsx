import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { GuestBanner } from '../../src/components/GuestBanner';
import { ProfileView } from '../../src/components/account/ProfileView';
import { IconSun, IconMoon } from '../../src/components/Icon';
import { useAuthStore } from '../../src/store/authStore';
import { useThemeStore } from '../../src/store/themeStore';
import { useLangStore } from '../../src/store/langStore';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { Fonts } from '../../src/theme';

/** Mobile "Me" tab. */
export default function MeScreen() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const { isDark, toggle } = useThemeStore();
  const { lang, setLang } = useLangStore();
  const c = useColors();
  const t = useT();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={[s.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>{t('my-profile')}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')} style={s.btn} activeOpacity={0.7}
          accessibilityLabel={t('language')}>
          <Text style={[s.langText, { color: c.textMuted }]}>{lang === 'zh' ? 'EN' : '中文'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggle} style={s.btn} activeOpacity={0.7} accessibilityLabel={t('dark-mode')}>
          {isDark ? <IconSun size={19} color={c.textMuted} /> : <IconMoon size={19} color={c.textMuted} />}
        </TouchableOpacity>
      </View>
      {currentUser?.guest ? (
        <>
          <View style={{ flex: 1 }} />
          <GuestBanner />
        </>
      ) : (
        <View style={{ flex: 1 }}>
          <ProfileView />
        </View>
      )}
      <BottomTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topbar: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: String(Fonts.semibold) as any },
  btn: { padding: 6, marginLeft: 4 },
  langText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
});

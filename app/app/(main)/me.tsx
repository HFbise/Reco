import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { GuestBanner } from '../../src/components/GuestBanner';
import { ProfileView } from '../../src/components/account/ProfileView';
import { IconSun, IconMoon } from '../../src/components/Icon';
import { IconButton } from '../../src/components/ui/Button';
import { PageHeader } from '../../src/components/ui/PageHeader';
import { useAuthStore } from '../../src/store/authStore';
import { useThemeStore } from '../../src/store/themeStore';
import { useLangStore } from '../../src/store/langStore';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { Fonts, Radius } from '../../src/theme';

/** Mobile "Me" tab. */
export default function MeScreen() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const { isDark, toggle } = useThemeStore();
  const { lang, setLang } = useLangStore();
  const c = useColors();
  const t = useT();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <PageHeader title={t('my-profile')}>
        <TouchableOpacity onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')} activeOpacity={0.7}
          style={[s.lang, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityLabel={t('language')}>
          <Text style={[s.langText, { color: c.textSub }]}>{lang === 'zh' ? 'EN' : '中文'}</Text>
        </TouchableOpacity>
        <IconButton label={t('dark-mode')} onPress={toggle}
          icon={(color) => (isDark ? <IconSun size={20} color={color} /> : <IconMoon size={20} color={color} />)} />
      </PageHeader>
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
  lang: { height: 36, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  langText: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
});

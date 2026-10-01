import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconChevronLeft } from '../../src/components/Icon';
import { IconButton } from '../../src/components/ui/Button';
import { DisplayText } from '../../src/components/ui/DisplayText';
import { SectionContent, sectionsFor } from '../../src/components/settings/sections';
import { useMobileVoice } from '../../src/context/VoiceContext';
import { useAccountSettings } from '../../src/hooks/useAccountSettings';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { useAuthStore } from '../../src/store/authStore';
import { Fonts, HEADER_HEIGHT, Spacing } from '../../src/theme';

/** Phone settings: every section on one page, opened from the Me tab. */
export default function SettingsScreen() {
  const c = useColors();
  const t = useT();
  const guest = useAuthStore((s) => !!s.currentUser?.guest);
  const account = useAccountSettings(!guest);
  const { voice, devices } = useMobileVoice();

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: c.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.bar}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(main)/me'))}
          icon={(color) => <IconChevronLeft size={22} color={color} />} />
        <DisplayText style={[s.title, { color: c.text }]} numberOfLines={1}>{t('settings')}</DisplayText>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {sectionsFor(guest).map((sec) => (
          <Fragment key={sec.id}>
            <Text style={[s.section, { color: c.text }]} accessibilityRole="header">{t(sec.title)}</Text>
            <SectionContent id={sec.id} account={account} voice={voice} devices={devices} />
          </Fragment>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  bar: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  title: { flex: 1, fontSize: 24 },
  scroll: { padding: Spacing.lg, paddingBottom: 48, gap: Spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  section: { fontSize: 19, fontWeight: String(Fonts.heavy) as any, marginTop: Spacing.md, paddingHorizontal: 4 },
});

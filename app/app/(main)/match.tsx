import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { GuestBanner } from '../../src/components/GuestBanner';
import { MatchView } from '../../src/components/match/MatchView';
import { useAuthStore } from '../../src/store/authStore';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';
import { Fonts } from '../../src/theme';

/** Mobile "Match" tab. */
export default function MatchScreen() {
  const isGuest = useAuthStore((s) => !!s.currentUser?.guest);
  const c = useColors();
  const t = useT();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <View style={[s.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <Text style={[s.title, { color: c.text }]}>{t('nav-match')}</Text>
      </View>
      {isGuest ? (
        <>
          <View style={{ flex: 1 }} />
          <GuestBanner />
        </>
      ) : (
        <MatchView onOpenDm={(r) => router.push({
          pathname: '/(main)/room/[name]',
          params: {
            name: r.dm_room,
            displayName: r.screenname,
            otherUsername: r.username,
            avatarColor: r.avatar_color,
            avatarExpression: r.avatar_expression,
          },
        })} />
      )}
      <BottomTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topbar: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: String(Fonts.semibold) as any },
});

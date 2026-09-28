import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { GuestBanner } from '../../src/components/GuestBanner';
import { MatchView } from '../../src/components/match/MatchView';
import { PageHeader } from '../../src/components/ui/PageHeader';
import { useAuthStore } from '../../src/store/authStore';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';

/** Mobile "Match" tab. */
export default function MatchScreen() {
  const isGuest = useAuthStore((s) => !!s.currentUser?.guest);
  const c = useColors();
  const t = useT();
  const header = <PageHeader title={t('nav-match')} />;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      {isGuest ? (
        <>
          {header}
          <View style={{ flex: 1 }} />
          <GuestBanner />
        </>
      ) : (
        <MatchView
          // The page title only shows before a match: in a chat, the stranger's header takes its place
          title={header}
          onOpenDm={(r) => router.push({
            pathname: '/(main)/room/[name]',
            params: {
              name: r.dm_room,
              displayName: r.screenname,
              otherUsername: r.username,
              avatarColor: r.avatar_color,
              avatarExpression: r.avatar_expression,
            },
          })}
        />
      )}
      <BottomTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
});

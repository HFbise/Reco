import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { MatchView } from '../../src/components/match/MatchView';
import { PageHeader } from '../../src/components/ui/PageHeader';
import { useColors } from '../../src/hooks/useColors';
import { useT } from '../../src/hooks/useT';

/** Mobile "Match" tab. Demo guests get the same page as a preview (starting asks them to sign up). */
export default function MatchScreen() {
  const c = useColors();
  const t = useT();

  return (
    <SafeAreaView style={[s.container, { backgroundColor: c.bg }]} edges={['top', 'left', 'right']}>
      <MatchView
        // The page title only shows before a match: in a chat, the stranger's header takes its place
        title={<PageHeader title={t('nav-match')} />}
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
      <BottomTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
});

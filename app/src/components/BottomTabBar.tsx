import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useColors } from '../hooks/useColors';
import { useAuthStore } from '../store/authStore';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconGroup } from './Icon';
import { Colors, Fonts } from '../theme';

export function BottomTabBar() {
  const pathname = usePathname();
  const c = useColors();
  const t = useT();
  const { currentUser } = useAuthStore();

  const isMe = pathname === '/me';

  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      <TouchableOpacity
        style={s.tab}
        onPress={() => router.replace('/(main)')}
        activeOpacity={0.7}
      >
        <IconGroup size={22} color={!isMe ? Colors.accent : c.textMuted} />
        <Text style={[s.label, { color: !isMe ? Colors.accent : c.textMuted }]}>{t('rooms')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.tab}
        onPress={() => router.replace('/(main)/me')}
        activeOpacity={0.7}
      >
        {currentUser ? (
          <AvatarView
            expression={currentUser.avatar_expression}
            color={currentUser.avatar_color}
            username={currentUser.username}
            screenname={currentUser.screenname}
            size={24}
          />
        ) : (
          <Text style={[s.icon, { color: isMe ? Colors.accent : c.textMuted }]}>👤</Text>
        )}
        <Text style={[s.label, { color: isMe ? Colors.accent : c.textMuted }]}>{t('my-profile')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 4,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 2,
  },
  icon: { fontSize: 22 },
  label: { fontSize: 10, fontWeight: String(Fonts.medium) as any },
});

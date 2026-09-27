import type { ReactNode } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useColors } from '../hooks/useColors';
import { useAuthStore } from '../store/authStore';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconChat, IconPerson, IconShuffle } from './Icon';
import { Fonts } from '../theme';

type Tab = 'rooms' | 'match' | 'me';

/** Mobile navigation: the same destinations as the desktop NavRail. */
export function BottomTabBar() {
  const pathname = usePathname();
  const c = useColors();
  const t = useT();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isGuest = !!currentUser?.guest;

  const active: Tab = pathname === '/me' ? 'me' : pathname === '/match' ? 'match' : 'rooms';
  const color = (tab: Tab) => (active === tab ? c.accent : c.textMuted);

  const tab = (key: Tab, label: string, href: '/(main)' | '/(main)/match' | '/(main)/me', icon: ReactNode) => (
    <TouchableOpacity key={key} style={s.tab} onPress={() => router.replace(href)} activeOpacity={0.7}
      accessibilityRole="tab" accessibilityState={{ selected: active === key }} accessibilityLabel={label}>
      {icon}
      <Text style={[s.label, { color: color(key) }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
      {tab('rooms', t('nav-chats'), '/(main)', <IconChat size={22} color={color('rooms')} />)}
      {!isGuest && tab('match', t('nav-match'), '/(main)/match', <IconShuffle size={21} color={color('match')} />)}
      {tab('me', t('nav-me'), '/(main)/me', currentUser && !isGuest ? (
        <AvatarView expression={currentUser.avatar_expression} color={currentUser.avatar_color}
          username={currentUser.username} screenname={currentUser.screenname} size={24} />
      ) : <IconPerson size={22} color={color('me')} />)}
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
  label: { fontSize: 10, fontWeight: String(Fonts.medium) as any },
});

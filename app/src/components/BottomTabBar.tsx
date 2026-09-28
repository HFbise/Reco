import type { ReactNode } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../hooks/useColors';
import { useAuthStore } from '../store/authStore';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconChat, IconPerson, IconShuffle } from './Icon';
import { Fonts, Radius } from '../theme';

type Tab = 'rooms' | 'match' | 'me';

/** Mobile navigation: the same destinations as the desktop NavRail. */
export function BottomTabBar() {
  const pathname = usePathname();
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isGuest = !!currentUser?.guest;

  const active: Tab = pathname === '/me' ? 'me' : pathname === '/match' ? 'match' : 'rooms';
  const color = (tab: Tab) => (active === tab ? c.accent : c.textSub);

  const tab = (key: Tab, label: string, href: '/(main)' | '/(main)/match' | '/(main)/me', icon: ReactNode) => {
    const on = active === key;
    return (
      <TouchableOpacity key={key} style={s.tab} onPress={() => router.replace(href)} activeOpacity={0.7}
        accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
        <View style={[s.iconPill, on && { backgroundColor: c.accentBg }]}>{icon}</View>
        <Text style={[s.label, { color: color(key) }, on && s.labelOn]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.bar, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
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
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 12 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  iconPill: { width: 52, height: 30, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: String(Fonts.bold) as any },
  labelOn: { fontWeight: String(Fonts.heavy) as any },
});

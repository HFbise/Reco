import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AvatarView } from './AvatarView';
import { BrandMark } from './BrandMark';
import { IconChat, IconLogout, IconMoon, IconSettings, IconShuffle, IconSun } from './Icon';
import { leaveDemoToSignUp } from './GuestBanner';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { logout } from '../lib/account';
import { Fonts, Radius } from '../theme';

export type Section = 'chats' | 'match' | 'me';

interface Props {
  active: Section;
  onSelect: (section: Section) => void;
  onOpenSettings: () => void;
  /** Hidden until the feature is available */
  showMatch?: boolean;
}

/** Desktop navigation: the same three destinations as the mobile tab bar. */
export function NavRail({ active, onSelect, onOpenSettings, showMatch = false }: Props) {
  const c = useColors();
  const t = useT();
  const currentUser = useAuthStore((s) => s.currentUser);
  const { isDark, toggle } = useThemeStore();
  const isGuest = !!currentUser?.guest;

  const item = (section: Section, label: string, icon: ReactNode) => {
    const on = active === section;
    return (
      <TouchableOpacity key={section} style={s.item} onPress={() => onSelect(section)} activeOpacity={0.75}
        accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
        <View style={[s.itemIcon, on && { backgroundColor: c.accentBg }]}>{icon}</View>
        <Text style={[s.itemLabel, { color: on ? c.accent : c.textMuted }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const iconButton = (label: string, onPress: () => void, icon: ReactNode) => (
    <TouchableOpacity style={s.iconBtn} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label}>
      {icon}
    </TouchableOpacity>
  );

  return (
    <View style={[s.rail, { backgroundColor: c.surface, borderRightColor: c.border }]}>
      <View style={s.logo}><BrandMark size={34} /></View>
      <View style={s.items}>
        {item('chats', t('nav-chats'), <IconChat size={22} color={active === 'chats' ? c.accent : c.textMuted} />)}
        {showMatch && !isGuest && item('match', t('nav-match'), <IconShuffle size={21} color={active === 'match' ? c.accent : c.textMuted} />)}
        {!isGuest && item('me', t('nav-me'), (
          <AvatarView expression={currentUser?.avatar_expression} color={currentUser?.avatar_color}
            username={currentUser?.username} screenname={currentUser?.screenname} size={26} />
        ))}
      </View>
      <View style={{ flex: 1 }} />
      {isGuest && (
        <TouchableOpacity style={[s.signUp, { backgroundColor: c.accent }]} onPress={leaveDemoToSignUp} activeOpacity={0.85}>
          <Text style={s.signUpText} numberOfLines={2}>{t('register')}</Text>
        </TouchableOpacity>
      )}
      {iconButton(t('dark-mode'), toggle, isDark ? <IconSun size={19} color={c.textMuted} /> : <IconMoon size={19} color={c.textMuted} />)}
      {iconButton(t('settings'), onOpenSettings, <IconSettings size={19} color={c.textMuted} />)}
      {iconButton(t('logout'), logout, <IconLogout size={19} color={c.textMuted} />)}
    </View>
  );
}

export const RAIL_W = 76;

const s = StyleSheet.create({
  rail: { width: RAIL_W, borderRightWidth: StyleSheet.hairlineWidth, alignItems: 'center', paddingVertical: 16, gap: 6 },
  logo: { height: 44, justifyContent: 'center', marginBottom: 10 },
  items: { gap: 10, alignItems: 'center' },
  item: { alignItems: 'center', width: RAIL_W - 8, gap: 4 },
  itemIcon: { width: 48, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: 11, fontWeight: String(Fonts.heavy) as any },
  iconBtn: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  signUp: { borderRadius: Radius.md, paddingHorizontal: 6, paddingVertical: 8, marginBottom: 6, width: RAIL_W - 14 },
  signUpText: { color: '#fff', fontSize: 11, fontWeight: String(Fonts.bold) as any, textAlign: 'center' },
});

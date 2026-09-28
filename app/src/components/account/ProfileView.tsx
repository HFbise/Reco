import { useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { AvatarView, ExprSvg } from '../AvatarView';
import { Button } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { IconChat, IconLock, IconLogout, IconPencil, IconTrash } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useAuthStore } from '../../store/authStore';
import { logout } from '../../lib/account';
import { getAvatarColor, tint } from '../../lib/avatar';
import { ChangePasswordModal, DeleteAccountModal, EditProfileModal, FeedbackModal } from './AccountModals';
import { Fonts, Radius, Spacing } from '../../theme';

type Dialog = 'edit' | 'password' | 'feedback' | 'delete' | null;

/** "Me": profile card, bio and account actions. Shared by the desktop panel and the mobile tab. */
export function ProfileView() {
  const c = useColors();
  const t = useT();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const avatarColor = currentUser?.avatar_color || getAvatarColor(currentUser?.username ?? '');

  return (
    <>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Same card as other people see: a wash of your color, your face, name and bio */}
        <View style={[s.card, { backgroundColor: c.surface }]}>
          <View style={[s.banner, { backgroundColor: tint(avatarColor, c.surface, c.isDark ? 0.8 : 0.82) }]}>
            <View style={[s.deco, { right: 40, top: 14, transform: [{ rotate: '14deg' }] }]} pointerEvents="none">
              <ExprSvg expression="Laugh" width={36} height={39} color={avatarColor} />
            </View>
            <View style={[s.deco, { right: 96, top: 50, opacity: 0.16, transform: [{ rotate: '-10deg' }] }]} pointerEvents="none">
              <ExprSvg expression="BigLaugh" width={26} height={28} color={avatarColor} />
            </View>
          </View>
          <View style={s.body}>
            <View style={s.topRow}>
              <View style={[s.avatarRing, { backgroundColor: c.surface }]}>
                <AvatarView expression={currentUser?.avatar_expression} color={currentUser?.avatar_color}
                  username={currentUser?.username} screenname={currentUser?.screenname} size={84} />
              </View>
              <Button label={t('edit-profile')} variant="secondary" onPress={() => setDialog('edit')} style={s.edit}
                icon={(color) => <IconPencil size={16} color={color} />} />
            </View>
            <View style={s.names}>
              <DisplayText style={[s.name, { color: c.text }]} numberOfLines={2}>{currentUser?.screenname}</DisplayText>
              <Text style={[s.handle, { color: c.textSub }]}>@{currentUser?.username}</Text>
            </View>
            <Text style={[s.bio, { color: currentUser?.bio ? c.text : c.textMuted }]}>{currentUser?.bio || t('no-bio')}</Text>
          </View>
        </View>

        <View style={[s.list, { backgroundColor: c.surface }]}>
          <Row label={t('change-password')} icon={<IconLock size={16} color={c.textSub} />} onPress={() => setDialog('password')} />
          <View style={[s.divider, { backgroundColor: c.border }]} />
          <Row label={t('feedback-btn')} icon={<IconChat size={18} color={c.textSub} />} onPress={() => setDialog('feedback')} />
        </View>

        <View style={[s.list, { backgroundColor: c.surface }]}>
          <Row label={t('logout')} icon={<IconLogout size={18} color={c.danger} />} onPress={logout} danger />
          <View style={[s.divider, { backgroundColor: c.border }]} />
          <Row label={t('delete-account')} icon={<IconTrash size={18} color={c.danger} />} onPress={() => setDialog('delete')} danger />
        </View>
      </ScrollView>

      <EditProfileModal visible={dialog === 'edit'} onClose={close} />
      <ChangePasswordModal visible={dialog === 'password'} onClose={close} />
      <FeedbackModal visible={dialog === 'feedback'} onClose={close} />
      <DeleteAccountModal visible={dialog === 'delete'} onClose={close} />
    </>
  );
}

function Row({ label, icon, onPress, danger }: { label: string; icon: ReactNode; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={[s.rowIcon, { backgroundColor: danger ? c.dangerBg : c.surface2 }]}>{icon}</View>
      <Text style={[s.rowText, { color: danger ? c.danger : c.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  scroll: { padding: Spacing.xl, gap: Spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { borderRadius: Radius.xxl, overflow: 'hidden' },
  banner: { height: 96, position: 'relative' },
  deco: { position: 'absolute', opacity: 0.22 },
  body: { paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxl, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -46 },
  avatarRing: { borderRadius: Radius.full, padding: 5 },
  edit: { minHeight: 40, paddingHorizontal: 16 },
  names: { gap: 2 },
  name: { fontSize: 26, lineHeight: 30 },
  handle: { fontSize: 14 },
  bio: { fontSize: 15, lineHeight: 22 },
  list: { borderRadius: Radius.xl, paddingVertical: 6 },
  divider: { height: 1, marginLeft: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, paddingHorizontal: Spacing.lg },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
});

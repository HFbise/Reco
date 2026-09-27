import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { AvatarView } from '../AvatarView';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useAuthStore } from '../../store/authStore';
import { logout } from '../../lib/account';
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

  const action = (label: string, onPress: () => void, color = c.text, border = c.border) => (
    <TouchableOpacity style={[s.outlineBtn, { borderColor: border }]} onPress={onPress} activeOpacity={0.86}>
      <Text style={[s.outlineText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={[s.card, { backgroundColor: c.surface }]}>
          <AvatarView expression={currentUser?.avatar_expression} color={currentUser?.avatar_color}
            username={currentUser?.username} screenname={currentUser?.screenname} size={72} />
          <Text style={[s.name, { color: c.text }]}>{currentUser?.screenname}</Text>
          <Text style={[s.handle, { color: c.textMuted }]}>@{currentUser?.username}</Text>
        </View>

        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: c.textMuted }]}>{t('bio-label')}</Text>
          <View style={[s.bioCard, { backgroundColor: c.surface }]}>
            <Text style={[s.bioText, { color: c.text }]}>{currentUser?.bio || t('no-bio')}</Text>
          </View>
        </View>

        <View style={s.actions}>
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: c.accent }]} onPress={() => setDialog('edit')} activeOpacity={0.86}>
            <Text style={s.primaryText}>{t('edit-profile')}</Text>
          </TouchableOpacity>
          {action(t('change-password'), () => setDialog('password'))}
          {action(t('feedback-btn'), () => setDialog('feedback'))}
          {action(t('logout'), logout, c.danger, c.danger)}
          {action(t('delete-account'), () => setDialog('delete'), c.danger, c.danger)}
        </View>
      </ScrollView>

      <EditProfileModal visible={dialog === 'edit'} onClose={close} />
      <ChangePasswordModal visible={dialog === 'password'} onClose={close} />
      <FeedbackModal visible={dialog === 'feedback'} onClose={close} />
      <DeleteAccountModal visible={dialog === 'delete'} onClose={close} />
    </>
  );
}

const s = StyleSheet.create({
  scroll: { padding: Spacing.xl, gap: Spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  card: { borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', gap: 6 },
  name: { fontSize: 20, fontWeight: String(Fonts.bold) as any, marginTop: 6 },
  handle: { fontSize: 13 },
  section: { gap: 6 },
  sectionLabel: { fontSize: 12, fontWeight: String(Fonts.semibold) as any, textTransform: 'uppercase' },
  bioCard: { borderRadius: Radius.md, padding: Spacing.lg },
  bioText: { fontSize: 14, lineHeight: 20 },
  actions: { gap: Spacing.sm },
  primaryBtn: { borderRadius: Radius.md, padding: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  outlineBtn: { borderRadius: Radius.md, padding: 12, alignItems: 'center', borderWidth: 1 },
  outlineText: { fontSize: 15, fontWeight: String(Fonts.semibold) as any },
});

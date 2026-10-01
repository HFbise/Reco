import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AvatarView } from '../AvatarView';
import { Button } from '../ui/Button';
import { ChoiceRow, Group, ToggleRow } from './parts';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { DmFrom, useAccountSettings } from '../../hooks/useAccountSettings';
import { getSocket } from '../../lib/socket';
import { useBlockStore } from '../../store/blockStore';
import { Fonts, Spacing } from '../../theme';

type Account = ReturnType<typeof useAccountSettings>;

interface Blocked { username: string; screenname: string; avatar_expression?: string; avatar_color?: string }

/** Who may message you first, whether you show as online, and the people you blocked. */
export function PrivacySettings({ account }: { account: Account }) {
  const t = useT();
  const { settings, change } = account;
  const dmOptions: { value: DmFrom; label: string }[] = [
    { value: 'everyone', label: t('dm-from-everyone') },
    { value: 'rooms', label: t('dm-from-rooms') },
    { value: 'nobody', label: t('dm-from-nobody') },
  ];

  return (
    <>
      <Group note={t('dm-from-note')}>
        <ChoiceRow label={t('dm-from')} value={settings?.dm_from} options={dmOptions} onChange={(v) => change({ dm_from: v })} />
      </Group>
      <Group>
        <ToggleRow label={t('show-online')} hint={t('show-online-hint')} value={settings?.show_online ?? true}
          disabled={!settings} onChange={(v) => change({ show_online: v })} />
      </Group>
      <BlockedList />
    </>
  );
}

function BlockedList() {
  const c = useColors();
  const t = useT();
  const removeBlocked = useBlockStore((s) => s.removeBlocked);
  const [people, setPeople] = useState<Blocked[] | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onList = (data: { people?: Blocked[] }) => setPeople(data.people ?? []);
    socket.on('blocked_users_list', onList);
    socket.emit('get_blocked_users', {});
    return () => { socket.off('blocked_users_list', onList); };
  }, []);

  function unblock(username: string) {
    getSocket().emit('unblock_user', { blocked: username });
    removeBlocked(username);
    setPeople((list) => list?.filter((p) => p.username !== username) ?? null);
  }

  return (
    <Group title={t('blocked-people')} note={t('blocked-note')}>
      {people === null ? null : people.length === 0 ? (
        <Text style={[s.empty, { color: c.textMuted }]}>{t('blocked-none')}</Text>
      ) : people.map((p) => (
        <View key={p.username} style={s.person}>
          <AvatarView expression={p.avatar_expression} color={p.avatar_color} username={p.username} screenname={p.screenname} size={36} />
          <View style={s.names}>
            <Text style={[s.name, { color: c.text }]} numberOfLines={1}>{p.screenname}</Text>
            <Text style={[s.handle, { color: c.textMuted }]} numberOfLines={1}>@{p.username}</Text>
          </View>
          <Button label={t('unblock')} variant="quiet" onPress={() => unblock(p.username)} style={s.button}
            accessibilityLabel={`${t('unblock')} ${p.screenname}`} />
        </View>
      ))}
    </Group>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: 14, paddingVertical: Spacing.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  names: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  handle: { fontSize: 13 },
  button: { minHeight: 36, paddingHorizontal: 14 },
});

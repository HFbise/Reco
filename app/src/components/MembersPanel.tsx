import { View, Text, ScrollView, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { AvatarView } from './AvatarView';
import { DisplayText } from './ui/DisplayText';
import { IconCrown, IconShield } from './Icon';
import { VoiceCard } from './voice/VoiceCard';
import type { Member } from './members/types';
import { useCardStore } from '../store/cardStore';
import { useDisplayName } from '../store/peopleStore';
import { useColors } from '../hooks/useColors';
import { useRoomMembers } from '../hooks/useRoomMembers';
import { useT } from '../hooks/useT';
import type { ExternalVoice } from './chat/types';
import type { VoiceMember } from '../hooks/useVoice';
import { Fonts, Spacing } from '../theme';

interface Props {
  room: string;
  voice?: ExternalVoice | null;
  roomVoiceMembers?: VoiceMember[];
  currentUsername?: string;
  isVoiceHere?: boolean;
  onJoinVoice?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Right-hand panel of a room: the voice card on top, then everyone in the room. */
export function MembersPanel({ room, voice, roomVoiceMembers, currentUsername, isVoiceHere, onJoinVoice, style }: Props) {
  const c = useColors();
  const t = useT();
  const members = useRoomMembers(room);
  const isGuest = !!useAuthStore((st) => st.currentUser?.guest);

  const online = members.filter((m) => m.is_online);
  const offline = members.filter((m) => !m.is_online);
  const voiceMembers = voice ? (roomVoiceMembers ?? voice.voiceMembers) : [];
  const inVoiceHere = !!voice && (isVoiceHere ?? voice.inVoice);
  const showCard = useCardStore((st) => st.show);
  const name = useDisplayName();
  const open = (m: Member | VoiceMember) => showCard(m, room);

  function renderRow(m: Member) {
    const isMe = m.username === currentUsername;
    return (
      <TouchableOpacity
        key={m.username}
        onPress={() => open(m)}
        activeOpacity={0.7}
        style={s.row}
      >
        <View style={!m.is_online && s.offlineAvatar}>
          <AvatarView expression={m.avatar_expression} color={m.avatar_color}
            username={m.username} screenname={m.screenname} size={36} />
        </View>
        <Text style={[s.rowName, { color: m.is_online ? c.text : c.textSub }]} numberOfLines={1}>
          {name(m.username, m.screenname)}
          {isMe && <Text style={[s.you, { color: c.textSub }]}>{t('you-suffix')}</Text>}
        </Text>
        {m.is_owner && <View accessibilityLabel={t('owner')}><IconCrown size={18} color={c.crown} /></View>}
        {m.is_admin && !m.is_owner && <View accessibilityLabel={t('admin')}><IconShield size={18} color={c.accent} /></View>}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface, borderLeftColor: c.border }, style]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {voice && !isGuest && (
          <VoiceCard
            voice={voice}
            members={voiceMembers}
            inVoice={inVoiceHere}
            currentUsername={currentUsername}
            onJoin={onJoinVoice ?? voice.joinVoice}
            onPressMember={open}
          />
        )}

        <View style={s.members}>
          <View style={s.heading}>
            <DisplayText style={[s.headingText, { color: c.text }]}>{t('members')}</DisplayText>
            {members.length > 0 && <Text style={[s.count, { color: c.textSub }]}>{members.length}</Text>}
          </View>
          {online.length > 0 && (
            <Text style={[s.section, { color: c.textMuted }]}>{`${t('online').toUpperCase()} · ${online.length}`}</Text>
          )}
          {online.map(renderRow)}
          {offline.length > 0 && (
            <Text style={[s.section, s.sectionGap, { color: c.textMuted }]}>{`${t('offline').toUpperCase()} · ${offline.length}`}</Text>
          )}
          {offline.map(renderRow)}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { width: 300, borderLeftWidth: 1 },
  scroll: { padding: Spacing.lg, paddingTop: 18, gap: 22 },

  members: { gap: 2 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 6, paddingBottom: 6 },
  headingText: { fontSize: 18 },
  count: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  section: { paddingHorizontal: 6, paddingVertical: 4, fontSize: 12, fontWeight: String(Fonts.heavy) as any, letterSpacing: 0.7 },
  sectionGap: { marginTop: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 14 },
  offlineAvatar: { opacity: 0.5 },
  rowName: { flex: 1, fontSize: 15, fontWeight: String(Fonts.bold) as any },
  you: { fontWeight: String(Fonts.semibold) as any },
});

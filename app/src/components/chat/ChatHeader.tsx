import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AvatarView } from '../AvatarView';
import { IconChevronLeft, IconInfo, IconMic, IconUsers } from '../Icon';
import { IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { useColors } from '../../hooks/useColors';
import { useDisplayName } from '../../store/peopleStore';
import { useT } from '../../hooks/useT';
import type { VoiceMember } from '../../hooks/useVoice';
import type { DmMeta } from './types';
import { Fonts, HEADER_HEIGHT, Spacing } from '../../theme';


interface Props {
  name: string;
  dmMeta?: DmMeta | null;
  /** Rooms: member count and room code, under the name */
  memberCount?: number;
  code?: string;
  showBackBtn: boolean;
  onBack: () => void;
  onOpenInfo: () => void;
  onOpenMembers: () => void;
  /** Voice members to preview in the pill; empty hides it */
  voicePillMembers: VoiceMember[];
  onVoicePillPress: () => void;
  /** Mobile: members open in a drawer from here */
  showMembersButton: boolean;
  /** The name (and a DM's avatar) was tapped: the room's card, or the other person's */
  onTitlePress: () => void;
}

export function ChatHeader({
  name, dmMeta, memberCount, code, showBackBtn, onBack, onOpenInfo, onOpenMembers, voicePillMembers, onVoicePillPress, showMembersButton,
  onTitlePress,
}: Props) {
  const displayName = useDisplayName();
  const c = useColors();
  const t = useT();
  const isDm = name.startsWith('dm:');
  const talking = voicePillMembers.find((m) => m.isSpeaking);
  const speaker = talking ?? voicePillMembers[0];

  const subtitle = isDm
    ? (dmMeta ? `@${dmMeta.username}` : '')
    : [memberCount ? t(memberCount === 1 ? 'header-member-one' : 'header-members', { n: memberCount }) : '',
      code ? t('header-code', { code }) : '']
        .filter(Boolean).join(' · ');

  return (
    <View style={[s.header, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      {showBackBtn && (
        <IconButton label={t('back')} onPress={onBack} icon={(color) => <IconChevronLeft size={22} color={color} />} />
      )}
      <TouchableOpacity onPress={onTitlePress} activeOpacity={0.7} style={s.titleTap} accessibilityRole="button"
        accessibilityLabel={isDm ? t('profile-of', { name: displayName(dmMeta?.username, dmMeta?.screenname ?? name) }) : undefined}>
        {isDm && dmMeta && (
          <AvatarView expression={dmMeta.avatarExpression} color={dmMeta.avatarColor}
            username={dmMeta.username} screenname={dmMeta.screenname} size={36} />
        )}
        <View style={s.titleBlock}>
          <DisplayText style={[s.title, { color: c.text }]} numberOfLines={1}>
            {isDm ? displayName(dmMeta?.username, dmMeta?.screenname ?? name) : t.room(name)}
          </DisplayText>
          {!!subtitle && <Text style={[s.subtitle, { color: c.textSub }]} numberOfLines={1}>{subtitle}</Text>}
        </View>
      </TouchableOpacity>
      {!isDm && voicePillMembers.length > 0 && (
        <TouchableOpacity onPress={onVoicePillPress} activeOpacity={0.7} accessibilityLabel={t('voice-chat')}
          style={[s.voicePill, { backgroundColor: talking ? c.successBg : c.accentBg }]}>
          <IconMic size={14} color={talking ? c.success : c.accent} />
          {/* Whoever is talking, ringed in green like on the voice card */}
          {speaker && (
            <View style={[s.pillRing, { borderColor: talking ? c.success : 'transparent' }]}
              accessibilityLabel={talking ? t('is-speaking', { name: talking.screenname }) : undefined}>
              <AvatarView username={speaker.username} screenname={speaker.screenname} color={speaker.avatar_color}
                expression={speaker.avatar_expression} size={20} />
            </View>
          )}
          <Text style={[s.voicePillCount, { color: c.accentText }]}>{voicePillMembers.length}</Text>
        </TouchableOpacity>
      )}
      <IconButton label={isDm ? t('chat-info') : t('room-info')} onPress={onOpenInfo}
        icon={(color) => <IconInfo size={20} color={color} />} />
      {showMembersButton && !isDm && (
        <IconButton label={t('members')} variant="tinted" onPress={onOpenMembers} icon={(color) => <IconUsers size={20} color={color} />} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: Spacing.lg, paddingRight: Spacing.md, borderBottomWidth: 1,
  },
  titleTap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleBlock: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 20 },
  subtitle: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  voicePill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 16 },
  pillRing: { borderWidth: 2, borderRadius: 14, padding: 1 },
  voicePillCount: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
});

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AvatarView } from '../AvatarView';
import { IconChevronLeft, IconGroup, IconInfo, IconMic } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { VoiceMember } from '../../hooks/useVoice';
import type { DmMeta } from './types';
import { Fonts, Spacing } from '../../theme';

interface Props {
  name: string;
  dmMeta?: DmMeta | null;
  showBackBtn: boolean;
  onBack: () => void;
  onOpenInfo: () => void;
  onOpenMembers: () => void;
  /** Voice members to preview in the pill; empty hides it */
  voicePillMembers: VoiceMember[];
  onVoicePillPress: () => void;
  /** Mobile: members open in a drawer from here */
  showMembersButton: boolean;
}

export function ChatHeader({
  name, dmMeta, showBackBtn, onBack, onOpenInfo, onOpenMembers, voicePillMembers, onVoicePillPress, showMembersButton,
}: Props) {
  const c = useColors();
  const t = useT();
  const isDm = name.startsWith('dm:');
  const speaker = voicePillMembers.find((m) => m.isSpeaking) ?? voicePillMembers[0];

  return (
    <View style={[s.header, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      {showBackBtn && (
        <TouchableOpacity onPress={onBack} style={s.iconBtn}>
          <IconChevronLeft size={20} color={c.accent} />
        </TouchableOpacity>
      )}
      {isDm ? (
        <View style={s.title} pointerEvents="box-none">
          {dmMeta && (
            <AvatarView expression={dmMeta.avatarExpression} color={dmMeta.avatarColor}
              username={dmMeta.username} screenname={dmMeta.screenname} size={24} />
          )}
          <Text style={[s.titleText, { color: c.text }]} numberOfLines={1}>{dmMeta?.screenname ?? name}</Text>
        </View>
      ) : (
        <View style={s.title} pointerEvents="box-none">
          <IconGroup size={18} color={c.text} />
          <Text style={[s.titleText, { color: c.text }]} numberOfLines={1}>{t.room(name)}</Text>
          <TouchableOpacity onPress={onOpenInfo} activeOpacity={0.6} style={s.infoBtn}>
            <IconInfo size={14} color={c.textMuted} />
          </TouchableOpacity>
        </View>
      )}
      {!isDm && voicePillMembers.length > 0 && (
        <TouchableOpacity onPress={onVoicePillPress} activeOpacity={0.7}
          style={[s.voicePill, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' }]}>
          <IconMic size={13} color={c.accent} />
          {speaker && <AvatarView username={speaker.username} screenname={speaker.screenname} color={speaker.avatar_color} size={18} />}
          <Text style={[s.voicePillCount, { color: c.accent }]}>({voicePillMembers.length})</Text>
        </TouchableOpacity>
      )}
      {showMembersButton && !isDm && (
        <TouchableOpacity onPress={onOpenMembers} style={s.iconBtn} activeOpacity={0.7}>
          <IconGroup size={20} color={c.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, borderBottomWidth: 1 },
  iconBtn: { padding: 6, marginRight: Spacing.xs, borderRadius: 6 },
  title: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleText: { flexShrink: 1, fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  infoBtn: { padding: 4, opacity: 0.5 },
  voicePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6 },
  voicePillCount: { fontSize: 12, fontWeight: '600' },
});

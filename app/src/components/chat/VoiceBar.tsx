import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AvatarView } from '../AvatarView';
import { IconMic, IconMicOff, IconPhoneOff, IconSpeaker } from '../Icon';
import { useT } from '../../hooks/useT';
import type { useColors } from '../../hooks/useColors';
import type { VoiceMember } from '../../hooks/useVoice';
import { Fonts, Spacing } from '../../theme';

/** Compact voice strip under the chat header (mobile). */
interface VoiceBarProps {
  inVoice: boolean;
  inVoiceElsewhere?: boolean;
  activeVoiceRoom?: string;
  voiceMembers: VoiceMember[];
  isMuted: boolean;
  currentUsername?: string;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  c: ReturnType<typeof useColors>;
}

export function VoiceBar({ inVoice, inVoiceElsewhere, activeVoiceRoom, voiceMembers, isMuted, currentUsername, onJoin, onLeave, onToggleMute, c }: VoiceBarProps) {
  const t = useT();
  const barBg = c.isDark ? 'rgba(79,142,247,0.12)' : 'rgba(79,142,247,0.08)';
  return (
    <View style={[vs.bar, { backgroundColor: barBg, borderBottomColor: c.border }]}>
      <IconSpeaker size={15} color={c.accent} />
      <Text style={[vs.label, { color: c.accent }]}>{t('voice-chat')}{voiceMembers.length > 0 ? ` (${voiceMembers.length})` : ''}</Text>
      <View style={vs.avatars}>
        {voiceMembers.slice(0, 5).map(m => (
          <AvatarView
            key={m.username}
            expression={undefined}
            color={m.avatar_color}
            username={m.username}
            screenname={m.screenname}
            size={22}
            style={[
              vs.voiceAvatar,
              m.isSpeaking && { borderColor: '#4f8ef7', borderWidth: 1.5 },
              (m.isMuted || (m.username === currentUsername && isMuted)) && { opacity: 0.5 },
            ]}
          />
        ))}
        {voiceMembers.length > 5 && (
          <Text style={[vs.moreBadge, { color: c.textMuted }]}>+{voiceMembers.length - 5}</Text>
        )}
      </View>
      <View style={{ flex: 1 }} />
      {!inVoice ? (
        <TouchableOpacity style={[vs.joinBtn, { backgroundColor: inVoiceElsewhere ? c.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' : c.accent }]} onPress={onJoin} activeOpacity={0.85}>
          <Text style={[vs.joinText, inVoiceElsewhere && { color: c.text }]}>
            {inVoiceElsewhere ? t('switch') : t('join-voice')}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={vs.controls}>
          <TouchableOpacity
            style={[vs.ctrlBtn, { backgroundColor: isMuted ? 'rgba(237,66,69,0.15)' : (c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)') }]}
            onPress={onToggleMute}
            activeOpacity={0.7}
          >
            {isMuted ? <IconMicOff size={14} color={c.danger} /> : <IconMic size={14} color={c.accent} />}
          </TouchableOpacity>
          <TouchableOpacity style={[vs.leaveBtn, { backgroundColor: c.danger }]} onPress={onLeave} activeOpacity={0.85}>
            <IconPhoneOff size={14} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const vs = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  avatars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  voiceAvatar: { borderRadius: 11, borderColor: 'transparent' },
  moreBadge: { fontSize: 11, marginLeft: 2 },
  joinBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  joinText: { color: '#fff', fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  controls: { flexDirection: 'row', gap: 5 },
  ctrlBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  leaveBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});

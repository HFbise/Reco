import { useRef, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { AvatarView } from '../AvatarView';
import { Button } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import {
  IconHeadphones, IconMic, IconMicOff, IconMusic, IconPhoneOff, IconScreenShare, IconSpeaker,
} from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { MAX_VOLUME } from '../../lib/webrtc';
import type { ExternalVoice } from '../chat/types';
import type { VoiceMember } from '../../hooks/useVoice';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props {
  voice: ExternalVoice;
  /** Who is in this room's voice channel */
  members: VoiceMember[];
  /** Whether I'm in voice in this room (not just somewhere) */
  inVoice: boolean;
  currentUsername?: string;
  onJoin: () => void;
  onPressMember: (m: VoiceMember) => void;
}

const COLUMNS = 3;
const GAP = 8;

// Phones' browsers have no getDisplayMedia, so no screen or tab-audio sharing there
const canShareScreen = Platform.OS === 'web' && typeof navigator !== 'undefined'
  && !!(navigator as any).mediaDevices?.getDisplayMedia;

/** Voice channel card: who's here, who's talking, and my controls. */
export function VoiceCard({ voice, members, inVoice, currentUsername, onJoin, onPressMember }: Props) {
  const c = useColors();
  const t = useT();
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = gridWidth ? Math.floor((gridWidth - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  const subtitle = [
    members.length > 0 ? t('voice-connected', { n: members.length }) : '',
    inVoice && voice.ping != null ? `${voice.ping} ms` : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={[s.card, { backgroundColor: c.surface2 }]} accessibilityLabel={t('voice-chat')}>
      <View style={s.titleRow}>
        <View style={[s.dot, { backgroundColor: members.length > 0 ? c.success : c.textMuted }]} />
        <DisplayText style={[s.title, { color: c.text }]}>{t('voice-chat')}</DisplayText>
        {!!subtitle && <Text style={[s.subtitle, { color: c.textSub }]} numberOfLines={1}>{subtitle}</Text>}
      </View>

      {members.length > 0 && (
        <View style={s.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {tileWidth > 0 && members.map((m) => {
            const muted = m.isMuted || (m.username === currentUsername && voice.isMuted);
            const name = m.screenname || m.username;
            return (
              <TouchableOpacity
                key={m.username}
                onPress={() => onPressMember(m)}
                activeOpacity={0.7}
                accessibilityLabel={name}
                style={[s.tile, { width: tileWidth, backgroundColor: c.surface }]}
              >
                <View style={[s.ring, { borderColor: m.isSpeaking ? c.success : 'transparent' }]}>
                  <AvatarView expression={m.avatar_expression} color={m.avatar_color}
                    username={m.username} screenname={m.screenname} size={44} />
                </View>
                <Text style={[s.tileName, { color: c.text }]} numberOfLines={1}>{name}</Text>
                {m.isLive ? (
                  <View style={[s.livePill, { backgroundColor: c.liveBg }]}>
                    <IconScreenShare size={11} color={c.live} />
                    <Text style={[s.liveText, { color: c.live }]}>LIVE</Text>
                  </View>
                ) : m.isStreamingAudio ? (
                  <View style={[s.livePill, { backgroundColor: c.accentBg }]}>
                    <IconMusic size={11} color={c.accentText} />
                  </View>
                ) : null}
                {muted && (
                  <View style={[s.mutedBadge, { backgroundColor: c.dangerBg }]}>
                    <IconMicOff size={12} color={c.danger} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {!inVoice ? (
        <Button label={t('join-voice')} onPress={onJoin} pill
          icon={(color) => <IconHeadphones size={18} color={color} />} />
      ) : (
        <View style={s.controls}>
          <Control
            label={voice.isMuted ? t('unmute-mic') : t('mute-mic')}
            onPress={voice.toggleMute}
            state={voice.isMuted ? 'off' : 'normal'}
            icon={(color) => voice.isMuted ? <IconMicOff size={19} color={color} /> : <IconMic size={19} color={color} />}
            volume={voice.micGainSupported ? voice.micVolume : undefined}
            onVolume={voice.setMicVolume}
          />
          <Control
            label={voice.isDeafened ? t('undeafen') : t('deafen')}
            onPress={voice.toggleDeafen}
            state={voice.isDeafened ? 'off' : 'normal'}
            icon={(color) => <IconSpeaker size={19} color={color} />}
            volume={Platform.OS === 'web' ? voice.speakerVolume : undefined}
            onVolume={voice.setSpeakerVolume}
          />
          {canShareScreen && (
            <>
              <Control
                label={voice.isStreaming ? t('stop-live') : t('live-stream')}
                onPress={voice.isStreaming ? voice.stopLive : voice.startLive}
                state={voice.isStreaming ? 'on' : 'normal'}
                icon={(color) => <IconScreenShare size={19} color={color} />}
              />
              <Control
                label={voice.isStreamingAudio ? t('stop-sharing') : t('share-audio')}
                onPress={voice.isStreamingAudio ? voice.stopStreamAudio : voice.startStreamAudio}
                state={voice.isStreamingAudio ? 'on' : 'normal'}
                icon={(color) => <IconMusic size={19} color={color} />}
              />
            </>
          )}
          <TouchableOpacity
            onPress={voice.leaveVoice}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('leave-voice')}
            style={[s.control, { backgroundColor: c.danger }]}
          >
            <IconPhoneOff size={19} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/**
 * Round voice control. `off` (muted, deafened) is red-tinted, `on` (sharing)
 * is brand-tinted. With `volume`, hovering shows a 0–150% slider above it (web).
 */
function Control({ label, onPress, state, icon, volume, onVolume }: {
  label: string;
  onPress: () => void;
  state: 'normal' | 'on' | 'off';
  icon: (color: string) => ReactNode;
  volume?: number;
  onVolume?: (v: number) => void;
}) {
  const c = useColors();
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const look = {
    normal: { bg: c.surface, fg: c.text },
    on: { bg: c.accent, fg: c.onAccent },
    off: { bg: c.dangerBg, fg: c.danger },
  }[state];

  // A short delay on leave lets the pointer cross the gap into the popover
  const hover = {
    onMouseEnter: () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); setHovered(true); },
    onMouseLeave: () => { leaveTimer.current = setTimeout(() => setHovered(false), 80); },
  } as any;

  return (
    <View style={s.controlWrap} {...hover}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: state !== 'normal' }}
        style={[s.control, s.raised, { backgroundColor: look.bg }]}
      >
        {icon(look.fg)}
      </TouchableOpacity>
      {hovered && volume !== undefined && onVolume && (
        <View style={[s.popover, { backgroundColor: c.surface, borderColor: c.border }]} {...hover}>
          <Text style={[s.popoverPct, { color: volume > 100 ? c.accent : c.text }]}>{Math.round(volume)}%</Text>
          <Slider
            style={s.popoverSlider}
            minimumValue={0} maximumValue={MAX_VOLUME}
            value={volume}
            onValueChange={onVolume}
            minimumTrackTintColor={c.accent}
            maximumTrackTintColor={c.border}
            thumbTintColor={c.accent}
            accessibilityLabel={label}
          />
        </View>
      )}
    </View>
  );
}

const CONTROL = 40;

const s = StyleSheet.create({
  card: { borderRadius: 22, padding: Spacing.lg, gap: 14, zIndex: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  title: { fontSize: 18, flexGrow: 1 },
  subtitle: { fontSize: 13, fontWeight: String(Fonts.bold) as any, flexShrink: 1 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 4,
    borderRadius: Radius.lg, position: 'relative',
  },
  ring: { borderWidth: 3, borderRadius: Radius.full, padding: 2 },
  tileName: { fontSize: 13, fontWeight: String(Fonts.heavy) as any, maxWidth: '100%' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full,
  },
  liveText: { fontSize: 11, fontWeight: String(Fonts.heavy) as any },
  mutedBadge: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  controlWrap: { position: 'relative', zIndex: 20 },
  control: { width: CONTROL, height: CONTROL, borderRadius: CONTROL / 2, alignItems: 'center', justifyContent: 'center' },
  raised: { shadowColor: '#161A23', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  popover: {
    // Opens to the right: the mic sits at the card's left edge, and the panel clips anything past it
    position: 'absolute', bottom: CONTROL + 8, left: -4, width: 130,
    borderRadius: Radius.md, borderWidth: 1, padding: 10, gap: 4, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 20, zIndex: 100,
  },
  popoverPct: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  popoverSlider: { width: 110, height: 24 },
});

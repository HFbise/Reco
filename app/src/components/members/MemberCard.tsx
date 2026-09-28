import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TextInput, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';
import { showAlert } from '../../lib/alert';
import { getSocket } from '../../lib/socket';
import { getAvatarColor, tint } from '../../lib/avatar';
import { MAX_VOLUME } from '../../lib/webrtc';
import { useBlockStore } from '../../store/blockStore';
import { useVolumeStore } from '../../store/volumeStore';
import { AvatarView, ExprSvg } from '../AvatarView';
import { Button, IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import {
  IconBan, IconChat, IconClose, IconCrown, IconFlag, IconLogout, IconMic, IconMicOff, IconShield, IconUserPlus, IconVolume,
} from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { Fonts, Radius, Spacing } from '../../theme';

export interface Member {
  username: string;
  screenname: string;
  is_admin: boolean;
  is_owner: boolean;
  is_online: boolean;
  avatar_color?: string;
  avatar_expression?: string;
  bio?: string;
}

/** 2 owner, 1 admin, 0 member: you can only moderate people below you */
export function levelOf(m: Member) {
  return m.is_owner ? 2 : m.is_admin ? 1 : 0;
}

interface Props {
  member: Member | null;
  room: string;
  currentUsername?: string;
  myLevel: number;
  /** They're in this room's voice channel */
  inVoice: boolean;
  /** Show the "how loud they are for me" slider */
  showVolume: boolean;
  onOpenDm?: (username: string, screenname: string, avatarExpression?: string, avatarColor?: string) => void;
  onClose: () => void;
}

/** Profile card for a room member: who they are, how loud they are, and what you can do. */
export function MemberCard({ member, room, currentUsername, myLevel, inVoice, showVolume, onOpenDm, onClose }: Props) {
  const c = useColors();
  const t = useT();
  const { blocked, addBlocked, removeBlocked } = useBlockStore();
  const { volumes, setVolume } = useVolumeStore();
  const [showMutePicker, setShowMutePicker] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');

  // Every opening starts from a clean card
  useEffect(() => {
    setShowMutePicker(false);
    setShowReport(false);
    setReportReason('');
  }, [member?.username]);

  if (!member) return null;
  const m = member;
  const isSelf = m.username === currentUsername;
  const isBlocked = blocked.includes(m.username);
  const canModerate = myLevel >= 1 && !isSelf && levelOf(m) < myLevel;
  const avatarColor = m.avatar_color || getAvatarColor(m.username);
  const banner = tint(avatarColor, c.surface, c.isDark ? 0.8 : 0.82);

  function kick() {
    showAlert(t('confirm-kick-title'), t('confirm-kick'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('ok'), style: 'destructive', onPress: () => { onClose(); getSocket().emit('kick_member', { room, target: m.username }); } },
    ]);
  }

  function setAdmin(remove: boolean) {
    onClose();
    getSocket().emit('set_admin', { room, target: m.username, remove });
  }

  function invite() {
    onClose();
    getSocket().emit('invite_to_room', { target: m.username, room });
  }

  function toggleBlock() {
    if (isBlocked) {
      getSocket().emit('unblock_user', { blocked: m.username });
      removeBlocked(m.username);
    } else {
      getSocket().emit('block_user', { blocked: m.username });
      addBlocked(m.username);
    }
    onClose();
  }

  function report() {
    getSocket().emit('report_user', { reported: m.username, reason: reportReason.trim() });
    onClose();
    showAlert(t('report-sent'));
  }

  function textMute(seconds: number | null) {
    onClose();
    if (seconds === null) getSocket().emit('text_unmute', { room, target: m.username });
    else getSocket().emit('text_mute', { room, target: m.username, duration_seconds: seconds });
  }

  const MUTE_DURATIONS = [
    { label: t('unmute'), seconds: null },
    { label: t('duration-1m'), seconds: 60 },
    { label: t('duration-5m'), seconds: 300 },
    { label: t('duration-10m'), seconds: 600 },
    { label: t('duration-30m'), seconds: 1800 },
    { label: t('duration-1h'), seconds: 3600 },
    { label: t('duration-1d'), seconds: 86400 },
    { label: t('duration-forever'), seconds: 0 },
  ];

  const volume = volumes[m.username] ?? 100;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[s.overlay, { backgroundColor: c.overlay }]} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.card, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} bounces={false}>
            {/* Banner in a wash of their color, with a couple of faint faces */}
            <View style={[s.banner, { backgroundColor: banner }]}>
              <View style={[s.deco, { right: 64, top: 16, transform: [{ rotate: '14deg' }] }]} pointerEvents="none">
                <ExprSvg expression="Laugh" width={36} height={39} color={avatarColor} />
              </View>
              <View style={[s.deco, { right: 118, top: 52, opacity: 0.16, transform: [{ rotate: '-10deg' }] }]} pointerEvents="none">
                <ExprSvg expression="BigLaugh" width={26} height={28} color={avatarColor} />
              </View>
              <IconButton label={t('close')} onPress={onClose} variant="raised" round size={40} style={s.close}
                icon={(color) => <IconClose size={16} color={color} />} />
            </View>

            <View style={s.body}>
              <View style={[s.avatarRing, { backgroundColor: c.surface }]}>
                <AvatarView expression={m.avatar_expression} color={m.avatar_color}
                  username={m.username} screenname={m.screenname} size={84} />
              </View>

              <View style={s.names}>
                <DisplayText style={[s.name, { color: c.text }]} numberOfLines={2}>{m.screenname}</DisplayText>
                <Text style={[s.handle, { color: c.textSub }]}>@{m.username}</Text>
              </View>

              <View style={s.chips}>
                <Chip bg={m.is_online ? c.successBg : c.surface2} fg={m.is_online ? c.text : c.textSub}
                  icon={<View style={[s.chipDot, { backgroundColor: m.is_online ? c.success : c.textMuted }]} />}
                  label={m.is_online ? t('online') : t('offline')} />
                {inVoice && (
                  <Chip bg={c.surface2} fg={c.textSub} icon={<IconMic size={13} color={c.textSub} />} label={t('in-voice')} />
                )}
                {m.is_owner && (
                  <Chip bg={c.sunnyBg} fg={c.text} icon={<IconCrown size={13} color={c.crown} />} label={t('owner')} />
                )}
                {m.is_admin && !m.is_owner && (
                  <Chip bg={c.accentBg} fg={c.accentText} icon={<IconShield size={13} color={c.accentText} />} label={t('admin')} />
                )}
              </View>

              {!!m.bio && <Text style={[s.bio, { color: c.text }]}>{m.bio}</Text>}

              {showVolume && (
                <View style={[s.volume, { backgroundColor: c.surface2 }]}>
                  <View style={s.volumeHead}>
                    <IconVolume size={18} color={c.textSub} />
                    <Text style={[s.volumeLabel, { color: c.text }]}>{t('user-volume')}</Text>
                    <Text style={[s.volumePct, { color: volume > 100 ? c.accent : c.text }]}>{Math.round(Math.min(volume, MAX_VOLUME))}%</Text>
                    {volume !== 100 && (
                      <TouchableOpacity onPress={() => setVolume(m.username, 100)} activeOpacity={0.7} style={s.reset}>
                        <Text style={[s.resetText, { color: c.accent }]}>{t('reset')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Slider
                    style={s.slider}
                    minimumValue={0} maximumValue={MAX_VOLUME} step={5}
                    value={Math.min(volume, MAX_VOLUME)}
                    onValueChange={(v) => setVolume(m.username, v)}
                    minimumTrackTintColor={c.accent}
                    maximumTrackTintColor={c.border}
                    thumbTintColor={c.accent}
                    accessibilityLabel={t('user-volume')}
                  />
                  <View style={s.ticks}>
                    {['0%', '100%', `${MAX_VOLUME}%`].map((tick) => (
                      <Text key={tick} style={[s.tick, { color: c.textMuted }]}>{tick}</Text>
                    ))}
                  </View>
                </View>
              )}

              {!isSelf && (
                <>
                  <View style={s.actions}>
                    {onOpenDm && (
                      <Button label={t('send-dm')} style={s.grow}
                        icon={(color) => <IconChat size={18} color={color} />}
                        onPress={() => { onClose(); onOpenDm(m.username, m.screenname, m.avatar_expression, m.avatar_color); }} />
                    )}
                    <Button label={t('invite-to-room')} variant="secondary" style={onOpenDm ? undefined : s.grow}
                      icon={(color) => <IconUserPlus size={18} color={color} />} onPress={invite} />
                  </View>

                  {!showReport ? (
                    <View style={s.links}>
                      <LinkButton label={isBlocked ? t('unblock') : t('block')} color={c.textSub}
                        icon={<IconBan size={16} color={c.textSub} />} onPress={toggleBlock} />
                      <LinkButton label={t('report')} color={c.danger}
                        icon={<IconFlag size={16} color={c.danger} />} onPress={() => setShowReport(true)} />
                    </View>
                  ) : (
                    <View style={s.reportBox}>
                      <TextInput
                        style={[s.reportInput, { backgroundColor: c.surface2, color: c.text, borderColor: c.border }]}
                        placeholder={t('report-reason')}
                        placeholderTextColor={c.textMuted}
                        value={reportReason}
                        onChangeText={setReportReason}
                        autoFocus
                      />
                      <View style={s.reportBtns}>
                        <Button label={t('cancel')} variant="quiet" style={s.grow}
                          onPress={() => { setShowReport(false); setReportReason(''); }} />
                        <Button label={t('report')} variant="danger" style={s.grow} onPress={report} />
                      </View>
                    </View>
                  )}
                </>
              )}

              {canModerate && (
                <View style={[s.moderation, { borderTopColor: c.border }]}>
                  <Text style={[s.sectionLabel, { color: c.textMuted }]}>{t('moderation').toUpperCase()}</Text>
                  <ModRow label={m.is_admin ? t('remove-admin') : t('set-as-admin')}
                    icon={<IconShield size={18} color={c.textSub} />} onPress={() => setAdmin(m.is_admin)} />
                  <ModRow label={t('ban-voice')} icon={<IconMicOff size={18} color={c.textSub} />}
                    onPress={() => setShowMutePicker((v) => !v)} />
                  {showMutePicker && (
                    <View style={s.durations}>
                      {MUTE_DURATIONS.map(({ label, seconds }) => (
                        <TouchableOpacity
                          key={label}
                          onPress={() => textMute(seconds)}
                          activeOpacity={0.7}
                          style={[s.duration, {
                            backgroundColor: seconds === null ? c.successBg : seconds === 0 ? c.dangerBg : c.surface2,
                          }]}
                        >
                          <Text style={[s.durationText, { color: seconds === null ? c.success : seconds === 0 ? c.danger : c.text }]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <ModRow label={t('kick-member')} danger icon={<IconLogout size={18} color={c.danger} />} onPress={kick} />
                </View>
              )}
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function Chip({ bg, fg, icon, label }: { bg: string; fg: string; icon: ReactNode; label: string }) {
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      {icon}
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function LinkButton({ label, color, icon, onPress }: { label: string; color: string; icon: ReactNode; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" style={s.link}>
      {icon}
      <Text style={[s.linkText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ModRow({ label, icon, onPress, danger }: { label: string; icon: ReactNode; onPress: () => void; danger?: boolean }) {
  const c = useColors();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button"
      style={[s.modRow, { backgroundColor: danger ? c.dangerBg : c.surface2 }]}>
      {icon}
      <Text style={[s.modText, { color: danger ? c.danger : c.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  card: { width: '100%', maxWidth: 380, maxHeight: '100%', borderRadius: Radius.xxl, overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 22 },

  banner: { height: 100, position: 'relative' },
  deco: { position: 'absolute', opacity: 0.22 },
  close: { position: 'absolute', top: 14, right: 14 },

  body: { paddingHorizontal: Spacing.xxl, gap: Spacing.lg },
  avatarRing: { marginTop: -46, alignSelf: 'flex-start', borderRadius: Radius.full, padding: 5 },
  names: { gap: 4, marginTop: -6 },
  name: { fontSize: 26, lineHeight: 30 },
  handle: { fontSize: 14 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 28, paddingHorizontal: 12, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  bio: { fontSize: 15, lineHeight: 22 },

  volume: { borderRadius: 18, paddingVertical: 14, paddingHorizontal: Spacing.lg, gap: 6 },
  volumeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volumeLabel: { flex: 1, fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  volumePct: { fontSize: 14, fontWeight: String(Fonts.heavy) as any, minWidth: 44, textAlign: 'right' },
  reset: { paddingHorizontal: 6, paddingVertical: 4 },
  resetText: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  slider: { width: '100%', height: 28 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { fontSize: 11, fontWeight: String(Fonts.bold) as any },

  actions: { flexDirection: 'row', gap: 10 },
  grow: { flexGrow: 1 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: -6 },
  link: { height: 36, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  reportBox: { gap: 8 },
  reportInput: { borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  reportBtns: { flexDirection: 'row', gap: 8 },

  moderation: { borderTopWidth: 1, paddingTop: Spacing.lg, gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: String(Fonts.heavy) as any, letterSpacing: 0.7 },
  modRow: { height: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  durations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  duration: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full },
  durationText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
});

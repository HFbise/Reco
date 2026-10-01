import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { AvatarView, ExprSvg } from '../AvatarView';
import { Button, IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import {
  IconBan, IconChat, IconChatOff, IconClock, IconClose, IconCrown, IconFlag, IconHash, IconLogout, IconMic, IconMicOff,
  IconPencil, IconShield, IconVolume,
} from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { showAlert } from '../../lib/alert';
import { getAvatarColor, tint } from '../../lib/avatar';
import { getSocket } from '../../lib/socket';
import { ago } from '../../lib/time';
import { MAX_VOLUME } from '../../lib/webrtc';
import { useAuthStore } from '../../store/authStore';
import { usePeopleStore } from '../../store/peopleStore';
import type { CardPerson } from '../../store/cardStore';
import { useVolumeStore } from '../../store/volumeStore';
import { Fonts, Radius, Spacing } from '../../theme';

/** The card as the server sends it (profiles.card) */
interface CardData {
  username: string;
  screenname: string;
  bio: string;
  avatar_expression: string;
  avatar_color: string;
  created_at: string | null;
  online: boolean;
  last_seen: string | null;
  mutual_rooms: string[];
  nickname: string;
  room: null | {
    level: number;
    my_level: number;
    in_voice: boolean;
    muted: boolean;
    muted_until: string | null;
    voice_banned: boolean;
    voice_banned_until: string | null;
  };
}

interface Props {
  person: CardPerson;
  /** The room it was opened in, if any */
  room: string | null;
  /** You're in this room's voice (their volume slider shows if they are too) */
  inVoiceHere: boolean;
  onOpenDm: (person: { username: string; screenname: string; avatar_expression?: string; avatar_color?: string }) => void;
  onOpenRoom: (room: string) => void;
  onEditProfile: () => void;
  onClose: () => void;
}

const MAX_NICKNAME = 32;

/**
 * Someone's card: who they are, when they were last on, your nickname for them, rooms you share,
 * and what you can do (message, block, report; in a room, moderation if you rank above them).
 * Opens at once with what's known and fills in from the server.
 */
export function ProfileCard({ person, room, inVoiceHere, onOpenDm, onOpenRoom, onEditProfile, onClose }: Props) {
  const c = useColors();
  const t = useT();
  const me = useAuthStore((s) => s.currentUser);
  const { blocked, addBlocked, removeBlocked } = usePeopleStore();
  const { volumes, setVolume } = useVolumeStore();
  const [data, setData] = useState<CardData | null>(null);
  const [picker, setPicker] = useState<'mute' | 'voice' | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [naming, setNaming] = useState(false);
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    setData(null);
    setPicker(null);
    setReporting(false);
    setNaming(false);
    const socket = getSocket();
    const onCard = (card: CardData) => {
      if (card.username !== person.username) return;
      setData(card);
      setNickname(card.nickname ?? '');
    };
    socket.on('profile_card', onCard);
    socket.emit('get_profile_card', { username: person.username, ...(room ? { room } : {}) });
    return () => { socket.off('profile_card', onCard); };
  }, [person.username, room]);

  const username = person.username;
  const screenname = data?.screenname ?? person.screenname ?? username;
  const color = data?.avatar_color ?? person.avatar_color ?? getAvatarColor(username);
  const expression = data?.avatar_expression ?? person.avatar_expression;
  const isSelf = username === me?.username;
  const guest = !!me?.guest;
  const isBlocked = blocked.includes(username);
  const inRoom = data?.room ?? null;
  const canModerate = !!inRoom && !isSelf && inRoom.my_level >= 1 && inRoom.level < inRoom.my_level;
  const volume = volumes[username] ?? 100;

  function lastSeen(): string {
    if (data?.online) return t('online');
    if (!data?.last_seen) return t('offline');
    const when = ago(data.last_seen);
    if (when.unit === 'now') return t('seen-just-now');
    if (when.unit === 'date') return t('seen-on', { date: t.monthDay(when.date) });
    return t(`seen-${when.unit}`, { n: when.n });
  }

  const moderate = (event: string, extra: object = {}) => {
    onClose();
    getSocket().emit(event, { room, target: username, ...extra });
  };

  function kick() {
    showAlert(t('confirm-kick-title'), t('confirm-kick'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('ok'), style: 'destructive', onPress: () => moderate('kick_member') },
    ]);
  }

  function toggleBlock() {
    getSocket().emit(isBlocked ? 'unblock_user' : 'block_user', { blocked: username });
    if (isBlocked) removeBlocked(username);
    else addBlocked(username);
    onClose();
  }

  function report() {
    getSocket().emit('report_user', { reported: username, reason: reason.trim() });
    onClose();
    showAlert(t('report-sent'));
  }

  function saveNickname() {
    getSocket().emit('set_nickname', { username, nickname: nickname.trim() });
    setData((d) => (d ? { ...d, nickname: nickname.trim() } : d));
    setNaming(false);
  }

  const durations = [
    { label: t('duration-1m'), seconds: 60 },
    { label: t('duration-5m'), seconds: 300 },
    { label: t('duration-10m'), seconds: 600 },
    { label: t('duration-30m'), seconds: 1800 },
    { label: t('duration-1h'), seconds: 3600 },
    { label: t('duration-1d'), seconds: 86400 },
    { label: t('duration-forever'), seconds: 0 },
  ];
  const until = (iso: string | null) => (iso ? t('until', { time: t.when(iso) }) : t('duration-forever'));
  const shownName = data?.nickname || screenname;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: c.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('close')} />
        <View style={[s.card, { backgroundColor: c.surface }]} accessibilityViewIsModal accessibilityLabel={t('profile-of', { name: shownName })}>
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} bounces={false}>
            {/* Banner in a wash of their color, with a couple of faint faces */}
            <View style={[s.banner, { backgroundColor: tint(color, c.surface, c.isDark ? 0.8 : 0.82) }]}>
              <View style={[s.deco, { right: 64, top: 16, transform: [{ rotate: '14deg' }] }]} pointerEvents="none">
                <ExprSvg expression="Laugh" width={36} height={39} color={color} />
              </View>
              <View style={[s.deco, { right: 118, top: 52, opacity: 0.16, transform: [{ rotate: '-10deg' }] }]} pointerEvents="none">
                <ExprSvg expression="Smile" width={26} height={28} color={color} />
              </View>
              <IconButton label={t('close')} onPress={onClose} variant="raised" round size={40} style={s.close}
                icon={(col) => <IconClose size={16} color={col} />} />
            </View>

            <View style={s.body}>
              <View style={[s.avatarRing, { backgroundColor: c.surface }]}>
                <AvatarView expression={expression} color={color} username={username} screenname={screenname} size={84} />
              </View>

              <View style={s.names}>
                <DisplayText style={[s.name, { color: c.text }]} numberOfLines={2}>{shownName}</DisplayText>
                <Text style={[s.handle, { color: c.textSub }]}>
                  {data?.nickname ? `${screenname} · @${username}` : `@${username}`}
                </Text>
              </View>

              <View style={s.chips}>
                <Chip bg={data?.online ? c.successBg : c.surface2} fg={data?.online ? c.text : c.textSub}
                  icon={<View style={[s.chipDot, { backgroundColor: data?.online ? c.success : c.textMuted }]} />} label={lastSeen()} />
                {inRoom?.in_voice && <Chip bg={c.surface2} fg={c.textSub} icon={<IconMic size={13} color={c.textSub} />} label={t('in-voice')} />}
                {inRoom?.level === 2 && <Chip bg={c.sunnyBg} fg={c.text} icon={<IconCrown size={13} color={c.crown} />} label={t('owner')} />}
                {inRoom?.level === 1 && (
                  <Chip bg={c.accentBg} fg={c.accentText} icon={<IconShield size={13} color={c.accentText} />} label={t('admin')} />
                )}
                {inRoom?.muted && (
                  <Chip bg={c.dangerBg} fg={c.danger} icon={<IconChatOff size={13} color={c.danger} />}
                    label={t('muted-chip', { until: until(inRoom.muted_until) })} />
                )}
                {inRoom?.voice_banned && (
                  <Chip bg={c.dangerBg} fg={c.danger} icon={<IconMicOff size={13} color={c.danger} />}
                    label={t('voice-banned-chip', { until: until(inRoom.voice_banned_until) })} />
                )}
              </View>

              {!!data?.bio && <Text style={[s.bio, { color: c.text }]}>{data.bio}</Text>}

              {(data?.created_at || (!isSelf && !guest)) && (
                <View style={[s.facts, { backgroundColor: c.surface2 }]}>
                  {!!data?.created_at && (
                    <Fact icon={<IconClock size={16} color={c.textSub} />} label={t('joined-reco')} value={t.monthYear(new Date(data.created_at))} />
                  )}
                  {!isSelf && !guest && !naming && (
                    <TouchableOpacity onPress={() => setNaming(true)} activeOpacity={0.7} accessibilityRole="button"
                      accessibilityLabel={t('nickname')}>
                      <Fact icon={<IconPencil size={15} color={c.textSub} />} label={t('nickname')}
                        value={data?.nickname || t('nickname-add')} faint={!data?.nickname} />
                    </TouchableOpacity>
                  )}
                  {naming && (
                    <View style={s.naming}>
                      <Text style={[s.factLabel, { color: c.textSub }]}>{t('nickname-hint')}</Text>
                      <TextInput value={nickname} onChangeText={setNickname} autoFocus maxLength={MAX_NICKNAME}
                        placeholder={screenname} placeholderTextColor={c.textMuted} onSubmitEditing={saveNickname}
                        accessibilityLabel={t('nickname')}
                        style={[s.nameInput, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]} />
                      <View style={s.row}>
                        <Button label={t('cancel')} variant="quiet" style={s.grow}
                          onPress={() => { setNaming(false); setNickname(data?.nickname ?? ''); }} />
                        <Button label={t('save')} style={s.grow} onPress={saveNickname} />
                      </View>
                    </View>
                  )}
                </View>
              )}

              {!!data?.mutual_rooms.length && (
                <View style={s.shared}>
                  <Text style={[s.sectionLabel, { color: c.textMuted }]}>
                    {t('rooms-in-common', { n: data.mutual_rooms.length }).toUpperCase()}
                  </Text>
                  <View style={s.chips}>
                    {data.mutual_rooms.map((name) => (
                      <TouchableOpacity key={name} onPress={() => { onClose(); onOpenRoom(name); }} activeOpacity={0.7}
                        accessibilityRole="button" style={[s.roomChip, { backgroundColor: c.accentBg }]}>
                        <IconHash size={13} color={c.accentText} />
                        <Text style={[s.chipText, { color: c.accentText }]} numberOfLines={1}>{name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {Platform.OS === 'web' && inVoiceHere && inRoom?.in_voice && !isSelf && (
                <View style={[s.volume, { backgroundColor: c.surface2 }]}>
                  <View style={s.volumeHead}>
                    <IconVolume size={18} color={c.textSub} />
                    <Text style={[s.volumeLabel, { color: c.text }]}>{t('user-volume')}</Text>
                    <Text style={[s.volumePct, { color: volume > 100 ? c.accent : c.text }]}>{Math.round(Math.min(volume, MAX_VOLUME))}%</Text>
                    {volume !== 100 && (
                      <TouchableOpacity onPress={() => setVolume(username, 100)} activeOpacity={0.7} style={s.reset}>
                        <Text style={[s.resetText, { color: c.accent }]}>{t('reset')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Slider style={s.slider} minimumValue={0} maximumValue={MAX_VOLUME} step={5} value={Math.min(volume, MAX_VOLUME)}
                    onValueChange={(v) => setVolume(username, v)} minimumTrackTintColor={c.accent} maximumTrackTintColor={c.border}
                    thumbTintColor={c.accent} accessibilityLabel={t('user-volume')} />
                </View>
              )}

              {isSelf ? (
                <Button label={t('edit-profile')} variant="secondary" icon={(col) => <IconPencil size={16} color={col} />}
                  onPress={() => { onClose(); onEditProfile(); }} />
              ) : !guest && (
                <>
                  <Button label={t('send-dm')} icon={(col) => <IconChat size={18} color={col} />}
                    onPress={() => {
                      onClose();
                      onOpenDm({ username, screenname, avatar_expression: expression, avatar_color: color });
                    }} />
                  {!reporting ? (
                    <View style={s.links}>
                      <LinkButton label={isBlocked ? t('unblock') : t('block')} color={c.textSub}
                        icon={<IconBan size={16} color={c.textSub} />} onPress={toggleBlock} />
                      <LinkButton label={t('report')} color={c.danger}
                        icon={<IconFlag size={16} color={c.danger} />} onPress={() => setReporting(true)} />
                    </View>
                  ) : (
                    <View style={s.naming}>
                      <TextInput value={reason} onChangeText={setReason} autoFocus placeholder={t('report-reason')}
                        placeholderTextColor={c.textMuted}
                        style={[s.nameInput, { backgroundColor: c.surface2, color: c.text, borderColor: c.border }]} />
                      <View style={s.row}>
                        <Button label={t('cancel')} variant="quiet" style={s.grow} onPress={() => { setReporting(false); setReason(''); }} />
                        <Button label={t('report')} variant="danger" style={s.grow} onPress={report} />
                      </View>
                    </View>
                  )}
                </>
              )}

              {canModerate && inRoom && (
                <View style={[s.moderation, { borderTopColor: c.border }]}>
                  <Text style={[s.sectionLabel, { color: c.textMuted }]}>{t('moderation').toUpperCase()}</Text>
                  {inRoom.my_level === 2 && (
                    <ModRow label={inRoom.level === 1 ? t('remove-admin') : t('set-as-admin')}
                      icon={<IconShield size={18} color={c.textSub} />}
                      onPress={() => moderate('set_admin', { remove: inRoom.level === 1 })} />
                  )}
                  {/* Chat: lift a mute, or pick how long one lasts */}
                  {inRoom.muted ? (
                    <ModRow label={t('lift-chat-mute')} icon={<IconChat size={18} color={c.textSub} />} onPress={() => moderate('text_unmute')} />
                  ) : (
                    <ModRow label={t('mute-in-chat')} icon={<IconChatOff size={18} color={c.textSub} />}
                      onPress={() => setPicker((p) => (p === 'mute' ? null : 'mute'))} />
                  )}
                  {picker === 'mute' && (
                    <Durations options={durations} onPick={(seconds) => moderate('text_mute', { duration_seconds: seconds })} />
                  )}
                  {/* Voice: lift a ban, or (while they're in voice) ban them from it */}
                  {inRoom.voice_banned ? (
                    <ModRow label={t('lift-voice-ban')} icon={<IconMic size={18} color={c.textSub} />} onPress={() => moderate('voice_unban')} />
                  ) : inRoom.in_voice && (
                    <ModRow label={t('ban-from-voice')} icon={<IconMicOff size={18} color={c.textSub} />}
                      onPress={() => setPicker((p) => (p === 'voice' ? null : 'voice'))} />
                  )}
                  {picker === 'voice' && (
                    <Durations options={durations} onPick={(seconds) => moderate('voice_ban', { duration_seconds: seconds })} />
                  )}
                  <ModRow label={t('kick-member')} danger icon={<IconLogout size={18} color={c.danger} />} onPress={kick} />
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
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

function Fact({ icon, label, value, faint }: { icon: ReactNode; label: string; value: string; faint?: boolean }) {
  const c = useColors();
  return (
    <View style={s.fact}>
      {icon}
      <Text style={[s.factLabel, { color: c.textSub }]}>{label}</Text>
      <Text style={[s.factValue, { color: faint ? c.accent : c.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Durations({ options, onPick }: { options: { label: string; seconds: number }[]; onPick: (seconds: number) => void }) {
  const c = useColors();
  return (
    <View style={s.durations}>
      {options.map(({ label, seconds }) => (
        <TouchableOpacity key={label} onPress={() => onPick(seconds)} activeOpacity={0.7}
          style={[s.duration, { backgroundColor: seconds === 0 ? c.dangerBg : c.surface2 }]}>
          <Text style={[s.durationText, { color: seconds === 0 ? c.danger : c.text }]}>{label}</Text>
        </TouchableOpacity>
      ))}
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

  facts: { borderRadius: 18, paddingHorizontal: Spacing.lg, paddingVertical: 4 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  factLabel: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  factValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  naming: { gap: 8, paddingVertical: 10 },
  nameInput: { borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, borderWidth: 1 },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flexGrow: 1 },

  shared: { gap: 8 },
  roomChip: { height: 30, maxWidth: 200, paddingHorizontal: 12, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', gap: 4 },

  volume: { borderRadius: 18, paddingVertical: 14, paddingHorizontal: Spacing.lg, gap: 6 },
  volumeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volumeLabel: { flex: 1, fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  volumePct: { fontSize: 14, fontWeight: String(Fonts.heavy) as any, minWidth: 44, textAlign: 'right' },
  reset: { paddingHorizontal: 6, paddingVertical: 4 },
  resetText: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  slider: { width: '100%', height: 28 },

  links: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: -6 },
  link: { height: 36, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },

  moderation: { borderTopWidth: 1, paddingTop: Spacing.lg, gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: String(Fonts.heavy) as any, letterSpacing: 0.7 },
  modRow: { height: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  modText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  durations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  duration: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full },
  durationText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
});

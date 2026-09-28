import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet, TextInput, Platform } from 'react-native';
import { showAlert } from '../lib/alert';
import Slider from '@react-native-community/slider';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useBlockStore } from '../store/blockStore';
import { useVolumeStore } from '../store/volumeStore';
import { MAX_VOLUME } from '../lib/webrtc';
import { AvatarView } from './AvatarView';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { IconMic, IconMicOff, IconSpeaker } from './Icon';
import type { ExternalVoice } from './chat/types';
import { Fonts, Radius, Spacing } from '../theme';

interface Member {
  username: string;
  screenname: string;
  is_admin: boolean;
  is_owner: boolean;
  is_online: boolean;
  avatar_color?: string;
  avatar_expression?: string;
  bio?: string;
}

const membersCache = new Map<string, Member[]>();

interface Props {
  room: string;
  voice?: ExternalVoice | null;
  roomVoiceMembers?: import('../hooks/useVoice').VoiceMember[];
  currentUsername?: string;
  onOpenDm?: (username: string, screenname: string, avatarExpression?: string, avatarColor?: string) => void;
  isVoiceHere?: boolean;
  onJoinVoice?: () => void;
}

export function MembersPanel({ room, voice, roomVoiceMembers, currentUsername, onOpenDm, isVoiceHere, onJoinVoice }: Props) {
  const c = useColors();
  const t = useT();
  const [members, setMembers] = useState<Member[]>(() => membersCache.get(room) ?? []);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showBanPicker, setShowBanPicker] = useState(false);
  const [showReportInput, setShowReportInput] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const { blocked, addBlocked, removeBlocked } = useBlockStore();
  const { volumes, setVolume } = useVolumeStore();

  useEffect(() => {
    if (!room) return;
    const socket = getSocket();
    setMembers(membersCache.get(room) ?? []);
    socket.emit('get_members', { room });

    const onMembersList = (data: { room: string; members: Member[] }) => {
      if (data.room !== room) return;
      membersCache.set(room, data.members);
      setMembers(data.members);
    };
    const onOnlineStatus = (data: { username: string; online: boolean }) => {
      setMembers(prev => prev.map(m => m.username === data.username ? { ...m, is_online: data.online } : m));
    };

    socket.on('members_list', onMembersList);
    socket.on('online_status_changed', onOnlineStatus);
    return () => {
      socket.off('members_list', onMembersList);
      socket.off('online_status_changed', onOnlineStatus);
    };
  }, [room]);

  const online = members.filter(m => m.is_online);
  const offline = members.filter(m => !m.is_online);
  const flatList = [...online, ...offline];

  function getLevel(m: Member) {
    if (m.is_owner) return 2;
    if (m.is_admin) return 1;
    return 0;
  }

  const myMember = members.find(m => m.username === currentUsername);
  const myLevel = myMember ? getLevel(myMember) : 0;
  const isGuest = !!useAuthStore(s2 => s2.currentUser?.guest);

  function doKick(target: Member) {
    showAlert(t('confirm-kick-title'), t('confirm-kick'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ok'), style: 'destructive', onPress: () => {
          setSelectedMember(null);
          getSocket().emit('kick_member', { room, target: target.username });
        },
      },
    ]);
  }

  function doSetAdmin(target: Member, remove: boolean) {
    setSelectedMember(null);
    getSocket().emit('set_admin', { room, target: target.username, remove });
  }

  function doInvite(target: Member) {
    setSelectedMember(null);
    getSocket().emit('invite_to_room', { target: target.username, room });
  }

  function doBlock(target: Member) {
    const isBlocked = blocked.includes(target.username);
    if (isBlocked) {
      getSocket().emit('unblock_user', { blocked: target.username });
      removeBlocked(target.username);
    } else {
      getSocket().emit('block_user', { blocked: target.username });
      addBlocked(target.username);
    }
    setSelectedMember(null);
  }

  function doReport(target: Member) {
    const reason = reportReason.trim();
    getSocket().emit('report_user', { reported: target.username, reason });
    setShowReportInput(false);
    setReportReason('');
    setSelectedMember(null);
    showAlert(t('report-sent'));
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

  function doTextMute(target: Member, seconds: number | null) {
    setSelectedMember(null);
    setShowBanPicker(false);
    if (seconds === null) {
      getSocket().emit('text_unmute', { room, target: target.username });
    } else {
      getSocket().emit('text_mute', { room, target: target.username, duration_seconds: seconds });
    }
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface, borderLeftColor: c.border }]}>

      {/* Voice */}
      {voice && !isGuest && (
        <View style={[s.voiceSection, { borderBottomColor: c.border }]}>
          {/* Title + ping */}
          <View style={s.voiceTitleRow}>
            <Text style={[s.voiceTitle, { color: c.text }]}>
              {t('voice-chat')}{(roomVoiceMembers ?? voice.voiceMembers).length > 0 ? ` (${(roomVoiceMembers ?? voice.voiceMembers).length})` : ''}
            </Text>
            {voice.ping != null && (
              <Text style={[s.voicePing, { color: c.textMuted }]}>{voice.ping} ms</Text>
            )}
          </View>

          {!(isVoiceHere ?? voice.inVoice) ? (
            <TouchableOpacity style={[s.voiceJoinBtn, { backgroundColor: c.accent }]} onPress={onJoinVoice ?? voice.joinVoice} activeOpacity={0.85}>
              <Text style={s.voiceJoinText}>{t('join-voice')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Controls */}
              <View style={s.voiceControls}>
                <VoiceIconBtn
                  isRed={voice.isMuted}
                  onPress={voice.toggleMute}
                  icon={voice.isMuted ? <IconMicOff size={15} color="#fff" /> : <IconMic size={15} color="#fff" />}
                  sliderValue={voice.micGainSupported ? voice.micVolume : undefined}
                  onSlider={voice.setMicVolume}
                  c={c}
                />
                <VoiceIconBtn
                  isRed={voice.isDeafened}
                  onPress={voice.toggleDeafen}
                  icon={<IconSpeaker size={15} color="#fff" />}
                  sliderValue={Platform.OS === 'web' ? voice.speakerVolume : undefined}
                  onSlider={voice.setSpeakerVolume}
                  c={c}
                />
                <TouchableOpacity style={[s.voiceLeaveBtn, { backgroundColor: '#ed4245' }]} onPress={voice.leaveVoice} activeOpacity={0.85}>
                  <Text style={s.voiceLeaveText}>📵 {t('leave-voice')}</Text>
                </TouchableOpacity>
              </View>

              {/* Share audio / screen */}
              <TouchableOpacity
                style={[s.voiceShareBtn, { backgroundColor: voice.isStreamingAudio ? '#ed4245' : '#4f5660' }]}
                onPress={() => voice.isStreamingAudio ? voice.stopStreamAudio() : voice.startStreamAudio()}
                activeOpacity={0.85}
              >
                <Text style={s.voiceShareBtnText}>{voice.isStreamingAudio ? t('stop-sharing') : t('share-audio')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.voiceLiveBtn, { backgroundColor: voice.isStreaming ? '#ed4245' : '#9b59b6' }]}
                onPress={() => voice.isStreaming ? voice.stopLive() : voice.startLive()}
                activeOpacity={0.85}
              >
                <Text style={s.voiceLiveBtnText}>{voice.isStreaming ? t('stop-live') : t('live-stream')}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Who is in voice */}
          {(roomVoiceMembers ?? voice.voiceMembers).length > 0 && (
            <View style={s.voiceMembersList}>
              {(roomVoiceMembers ?? voice.voiceMembers).map(m => {
                const selfMuted = m.username === currentUsername && voice.isMuted;
                const muted = m.isMuted || selfMuted;
                return (
                  <TouchableOpacity
                    key={m.username}
                    style={[s.voiceMemberRow, m.isSpeaking && s.voiceMemberSpeaking]}
                    onPress={() => {
                      const found = members.find(mb => mb.username === m.username);
                      setSelectedMember(found ?? {
                        username: m.username, screenname: m.screenname,
                        is_admin: false, is_owner: false, is_online: true,
                        avatar_color: m.avatar_color, avatar_expression: m.avatar_expression,
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <AvatarView
                      expression={m.avatar_expression}
                      color={m.avatar_color}
                      username={m.username}
                      screenname={m.screenname}
                      size={24}
                    />
                    <Text style={[s.voiceMemberIcon, { color: muted ? c.danger : c.textMuted }]}>
                      {muted ? '🔇' : '🎤'}
                    </Text>
                    <Text style={[s.voiceMemberName, { color: c.text }]} numberOfLines={1}>
                      {m.screenname || m.username}
                    </Text>
                    {m.isLive && (
                      <View style={s.voiceLiveBadge}>
                        <Text style={s.voiceLiveBadgeText}>LIVE</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Members header */}
      <View style={[s.header, { borderBottomColor: c.border }]}>
        <Text style={[s.headerText, { color: c.text }]}>{t('members')}{members.length > 0 ? ` (${members.length})` : ''}</Text>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {flatList.map(m => (
          <MemberRow key={m.username} member={m} c={c} offline={!m.is_online} onPress={() => { if (!isGuest) setSelectedMember(m); }} />
        ))}
      </ScrollView>

      {/* Member card */}
      <Modal visible={!!selectedMember} transparent animationType="fade" onRequestClose={() => { setSelectedMember(null); setShowBanPicker(false); setShowReportInput(false); setReportReason(''); }}>
        <TouchableOpacity style={s.cardOverlay} onPress={() => { setSelectedMember(null); setShowBanPicker(false); setShowReportInput(false); setReportReason(''); }} activeOpacity={1}>
          <TouchableOpacity style={[s.cardBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            {selectedMember && (
              <>
                <AvatarView
                  expression={selectedMember.avatar_expression}
                  color={selectedMember.avatar_color}
                  username={selectedMember.username}
                  screenname={selectedMember.screenname}
                  size={64}
                />
                <Text style={[s.cardName, { color: c.text }]}>{selectedMember.screenname}</Text>
                <Text style={[s.cardHandle, { color: c.textMuted }]}>@{selectedMember.username}</Text>
                {selectedMember.is_owner && (
                  <Text style={[s.cardBadge, { color: c.accent }]}>👑 {t('owner')}</Text>
                )}
                {selectedMember.is_admin && !selectedMember.is_owner && (
                  <Text style={[s.cardBadge, { color: c.accent }]}>🛡 {t('admin')}</Text>
                )}
                {!!selectedMember.bio && (
                  <Text style={[s.cardBio, { color: c.textMuted }]}>{selectedMember.bio}</Text>
                )}
                <View style={[s.cardDivider, { backgroundColor: c.border }]} />
                <View style={[s.cardStatus, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}>
                  <View style={[s.cardDot, { backgroundColor: selectedMember.is_online ? c.success : c.textMuted }]} />
                  <Text style={[s.cardStatusText, { color: c.textMuted }]}>
                    {selectedMember.is_online ? t('online') : t('offline')}
                  </Text>
                </View>
                {/* How loud they are for me (web: goes above 100% through Web Audio) */}
                {Platform.OS === 'web' && voice?.inVoice && selectedMember.username !== currentUsername
                  && (roomVoiceMembers ?? voice.voiceMembers).some((m) => m.username === selectedMember.username) && (
                  <UserVolume
                    value={volumes[selectedMember.username] ?? 100}
                    max={MAX_VOLUME}
                    onChange={(v) => setVolume(selectedMember.username, v)}
                    label={t('user-volume')}
                    resetLabel={t('reset')}
                    c={c}
                  />
                )}
                {selectedMember.username !== currentUsername && (
                  <View style={{ width: '100%', gap: 8 }}>
                    {onOpenDm && (
                      <TouchableOpacity
                        style={[s.cardDmBtn, { backgroundColor: c.accent }]}
                        onPress={() => {
                          setSelectedMember(null);
                          onOpenDm(
                            selectedMember.username,
                            selectedMember.screenname,
                            selectedMember.avatar_expression,
                            selectedMember.avatar_color,
                          );
                        }}
                        activeOpacity={0.86}
                      >
                        <Text style={s.cardDmBtnText}>{t('send-dm')}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.cardDmBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}
                      onPress={() => doInvite(selectedMember)}
                      activeOpacity={0.86}
                    >
                      <Text style={[s.cardDmBtnText, { color: c.text }]}>{t('invite-to-room')}</Text>
                    </TouchableOpacity>
                    {/* Block */}
                    <TouchableOpacity
                      style={[s.cardDmBtn, { backgroundColor: blocked.includes(selectedMember.username) ? c.isDark ? 'rgba(237,66,69,0.15)' : 'rgba(237,66,69,0.08)' : c.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                      onPress={() => doBlock(selectedMember)}
                      activeOpacity={0.86}
                    >
                      <Text style={[s.cardDmBtnText, { color: blocked.includes(selectedMember.username) ? c.danger : c.textMuted }]}>
                        {blocked.includes(selectedMember.username) ? t('unblock') : t('block')}
                      </Text>
                    </TouchableOpacity>
                    {/* Report */}
                    {!showReportInput ? (
                      <TouchableOpacity
                        style={[s.cardDmBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                        onPress={() => setShowReportInput(true)}
                        activeOpacity={0.86}
                      >
                        <Text style={[s.cardDmBtnText, { color: c.textMuted }]}>{t('report')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={s.reportBox}>
                        <TextInput
                          style={[s.reportInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                          placeholder={t('report-reason')}
                          placeholderTextColor={c.textMuted}
                          value={reportReason}
                          onChangeText={setReportReason}
                          autoFocus
                        />
                        <View style={s.reportBtns}>
                          <TouchableOpacity style={[s.reportCancelBtn, { borderColor: c.border }]} onPress={() => { setShowReportInput(false); setReportReason(''); }}>
                            <Text style={[{ fontSize: 13, color: c.textMuted }]}>{t('cancel')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.reportSendBtn, { backgroundColor: c.danger }]} onPress={() => doReport(selectedMember)}>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: String(Fonts.semibold) as any }}>{t('report')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}
                {/* Admin controls — only show when current user outranks target */}
                {myLevel >= 1 && selectedMember.username !== currentUsername && getLevel(selectedMember) < myLevel && (
                  <View style={s.adminActions}>
                    <TouchableOpacity style={[s.adminBtn, { backgroundColor: c.danger }]} onPress={() => doKick(selectedMember)} activeOpacity={0.8}>
                      <Text style={s.adminBtnText}>{t('kick-member')}</Text>
                    </TouchableOpacity>
                    {!selectedMember.is_admin ? (
                      <TouchableOpacity style={[s.adminBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} onPress={() => doSetAdmin(selectedMember, false)} activeOpacity={0.8}>
                        <Text style={[s.adminBtnText, { color: c.text }]}>{t('set-as-admin')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[s.adminBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} onPress={() => doSetAdmin(selectedMember, true)} activeOpacity={0.8}>
                        <Text style={[s.adminBtnText, { color: c.text }]}>{t('remove-admin')}</Text>
                      </TouchableOpacity>
                    )}
                    {/* Mute, with duration */}
                    {!showBanPicker ? (
                      <TouchableOpacity
                        style={[s.adminBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }]}
                        onPress={() => setShowBanPicker(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.adminBtnText, { color: c.textMuted }]}>{t('ban-voice')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[s.banPickerBox, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderColor: c.border }]}>
                        {MUTE_DURATIONS.map(({ label, seconds }) => (
                          <TouchableOpacity
                            key={label}
                            style={[s.banPickerItem, { borderBottomColor: c.border }]}
                            onPress={() => doTextMute(selectedMember, seconds)}
                            activeOpacity={0.7}
                          >
                            <Text style={[s.banPickerText, { color: seconds === null ? c.success : seconds === 0 ? c.danger : c.text }]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={s.banPickerItem} onPress={() => setShowBanPicker(false)} activeOpacity={0.7}>
                          <Text style={[s.banPickerText, { color: c.textMuted }]}>{t('cancel')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
                <TouchableOpacity style={[s.cardCloseBtn, { borderColor: c.border }]} onPress={() => setSelectedMember(null)}>
                  <Text style={[s.cardCloseBtnText, { color: c.textMuted }]}>{t('close')}</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function UserVolume({ value, max, onChange, label, resetLabel, c }: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  resetLabel: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={s.userVol}>
      <View style={s.userVolHead}>
        <Text style={[s.userVolLabel, { color: c.textMuted }]}>{label}</Text>
        <Text style={[s.userVolPct, { color: value > 100 ? c.accent : c.text }]}>{Math.round(Math.min(value, max))}%</Text>
        {value !== 100 && (
          <TouchableOpacity onPress={() => onChange(100)} activeOpacity={0.7} accessibilityLabel={resetLabel}>
            <Text style={[s.userVolReset, { color: c.accent }]}>{resetLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Slider
        style={s.userVolSlider}
        minimumValue={0} maximumValue={max} step={5}
        value={Math.min(value, max)}
        onValueChange={onChange}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.border}
        thumbTintColor={c.accent}
        accessibilityLabel={label}
      />
    </View>
  );
}

function VoiceIconBtn({ isRed, onPress, icon, sliderValue, onSlider, c }: {
  isRed: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  sliderValue?: number;
  onSlider?: (v: number) => void;
  c: ReturnType<typeof useColors>;
}) {
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function enter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  }
  function leave() {
    leaveTimer.current = setTimeout(() => setHovered(false), 80);
  }

  const hoverHandlers = { onMouseEnter: enter, onMouseLeave: leave } as any;

  return (
    <View style={s.voiceIconBtnWrap} {...hoverHandlers}>
      <TouchableOpacity
        style={[s.voiceIconBtn, { backgroundColor: isRed ? '#ed4245' : c.accent }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {icon}
      </TouchableOpacity>
      {hovered && sliderValue !== undefined && onSlider && (
        <View
          style={[s.volPopover, { backgroundColor: c.isDark ? '#2f3136' : '#fff', borderColor: c.border }]}
          {...hoverHandlers}
        >
          <Text style={[s.volPopoverPct, { color: c.text }]}>{Math.round(sliderValue)}%</Text>
          <Slider
            style={s.volPopoverSlider}
            minimumValue={0} maximumValue={MAX_VOLUME}
            value={sliderValue}
            onValueChange={onSlider}
            minimumTrackTintColor={c.accent}
            maximumTrackTintColor={c.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}
            thumbTintColor={c.accent}
          />
        </View>
      )}
    </View>
  );
}

function MemberRow({ member, c, offline = false, onPress }: { member: Member; c: ReturnType<typeof useColors>; offline?: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <TouchableOpacity style={[s.memberItem, offline && { opacity: 0.38 }]} onPress={onPress} activeOpacity={0.7}>
      <View style={s.avatarWrap}>
        <AvatarView
          expression={member.avatar_expression}
          color={member.avatar_color}
          username={member.username}
          screenname={member.screenname}
          size={30}
        />
        <View style={[s.dot, { backgroundColor: offline ? c.textMuted : c.success, borderColor: c.surface }]} />
      </View>
      <View style={s.memberInfo}>
        <Text style={[s.memberName, { color: c.text }]} numberOfLines={1}>
          {member.screenname}
        </Text>
        {member.is_owner && <Text style={[s.badge, { color: c.accent }]}>{t('owner')}</Text>}
        {member.is_admin && !member.is_owner && <Text style={[s.badge, { color: c.accent }]}>{t('admin')}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  userVol: { width: '100%', marginTop: 4, marginBottom: 8 },
  userVolHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userVolLabel: { flex: 1, fontSize: 12, fontWeight: '600' as any },
  userVolPct: { fontSize: 12, fontWeight: '700' as any, minWidth: 38, textAlign: 'right' },
  userVolReset: { fontSize: 12, fontWeight: '600' as any },
  userVolSlider: { width: '100%', height: 32 },
  container: { width: 230, borderLeftWidth: 1, flexDirection: 'column' },

  voiceSection: { borderBottomWidth: 1, padding: Spacing.sm, gap: 5 },
  voiceTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  voiceTitle: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  voicePing: { fontSize: 11 },
  voiceJoinBtn: { borderRadius: 7, paddingVertical: 9, alignItems: 'center' },
  voiceJoinText: { color: '#fff', fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  voiceControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceIconBtnWrap: { position: 'relative', zIndex: 20 },
  voiceIconBtn: { width: 34, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  voiceLeaveBtn: { flex: 1, borderRadius: 7, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  voiceLeaveText: { color: '#fff', fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  volPopover: {
    position: 'absolute', bottom: 38, left: -38,
    width: 110, borderRadius: 8, borderWidth: 1,
    padding: 8, gap: 4, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 20, zIndex: 100,
  },
  volPopoverPct: { fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  volPopoverSlider: { width: 94, height: 24 },
  voiceShareBtn: { borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#4f5660', marginTop: 1 },
  voiceShareBtnText: { color: '#fff', fontSize: 12 },
  voiceLiveBtn: { borderRadius: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#9b59b6', marginTop: 2 },
  voiceLiveBtnText: { color: '#fff', fontSize: 12 },
  voiceMembersList: { flexDirection: 'column', gap: 2, marginTop: 4 },
  voiceMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 2, borderRadius: 5, borderWidth: 1.5, borderColor: 'transparent' },
  voiceMemberSpeaking: { borderColor: '#3ba55c', backgroundColor: 'rgba(59,165,92,0.1)' },
  voiceMemberIcon: { fontSize: 12, flexShrink: 0 },
  voiceMemberName: { flex: 1, fontSize: 13 },
  voiceLiveBadge: { backgroundColor: '#dc2626', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  voiceLiveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  header: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  headerText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },

  list: { padding: Spacing.sm, gap: 2, paddingBottom: Spacing.lg },

  memberItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5, paddingHorizontal: Spacing.sm, borderRadius: 6,
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  dot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 9, height: 9, borderRadius: 5, borderWidth: 1.5,
  },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 13, fontWeight: String(Fonts.medium) as any },
  badge: { fontSize: 10, fontWeight: String(Fonts.semibold) as any },

  cardOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  cardBox: {
    width: 240, borderRadius: Radius.lg, padding: Spacing.xl,
    alignItems: 'center', gap: Spacing.sm,
  },
  cardName: { fontSize: 18, fontWeight: String(Fonts.bold) as any, marginTop: Spacing.xs },
  cardHandle: { fontSize: 13 },
  cardBadge: { fontSize: 12 },
  cardBio: { fontSize: 13, textAlign: 'center' },
  cardDivider: { width: '100%', height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  cardStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  cardDot: { width: 8, height: 8, borderRadius: 4 },
  cardStatusText: { fontSize: 12 },
  cardDmBtn: {
    width: '100%', borderRadius: Radius.md, padding: 10, alignItems: 'center',
  },
  cardDmBtnText: { color: '#fff', fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  adminActions: { width: '100%', gap: 6 },
  adminBtn: { borderRadius: Radius.md, padding: 8, alignItems: 'center' },
  adminBtnText: { color: '#fff', fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  banPickerBox: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  banPickerItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  banPickerText: { fontSize: 14 },
  cardCloseBtn: {
    marginTop: Spacing.xs, width: '100%', borderRadius: Radius.md,
    padding: 9, alignItems: 'center', borderWidth: 1,
  },
  cardCloseBtnText: { fontSize: 14 },
  reportBox: { width: '100%', gap: 6 },
  reportInput: { borderRadius: Radius.md, padding: 10, fontSize: 14, borderWidth: 1 },
  reportBtns: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  reportCancelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md, borderWidth: 1 },
  reportSendBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md },
});

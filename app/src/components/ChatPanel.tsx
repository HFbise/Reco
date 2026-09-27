import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Modal, Alert, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';
import { MessageBubble, type Message, formatMsgTime } from './MessageBubble';
import { getCached, getLastTs, cacheMsg, patchCached } from '../lib/messageCache';
import { EmojiPicker } from './EmojiPicker';
import { loadRecentEmojis, recordRecentEmoji, buildReactionQuickList } from '../lib/recentEmojis';
import { AvatarView } from './AvatarView';
import { MembersPanel } from './MembersPanel';
import { useColors } from '../hooks/useColors';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useT } from '../hooks/useT';
import { useVoice, type VoiceMember } from '../hooks/useVoice';
import { useBlockStore } from '../store/blockStore';
import {
  IconChevronLeft, IconSend, IconEmoji,
  IconMic, IconMicOff, IconPhoneOff, IconGroup, IconInfo,
} from './Icon';
import { Fonts, Radius, Spacing } from '../theme';

const REACTION_BAR_H = 54;

type FeedItem =
  | (Message & { _type?: 'msg' })
  | { _type: 'sep'; _id: string; time: string };

function buildFeed(messages: Message[]): FeedItem[] {
  const items: FeedItem[] = [];
  let lastTime = '';
  for (const msg of messages) {
    const t = formatMsgTime(msg.time);
    if (t && t !== lastTime) {
      items.push({ _type: 'sep', _id: `sep_${t}_${msg.id}`, time: t });
      lastTime = t;
    }
    items.push({ ...msg, _type: 'msg' });
  }
  return items;
}

export interface ExternalVoice {
  inVoice: boolean;
  voiceMembers: VoiceMember[];
  isMuted: boolean;
  isDeafened: boolean;
  ping: number | null;
  micVolume: number;
  speakerVolume: number;
  isStreamingAudio: boolean;
  isStreaming: boolean;
  remoteVideoStreams: Record<string, { stream: MediaStream; screenname: string }>;
  joinVoice: () => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setMicVolume: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  startStreamAudio: () => void;
  stopStreamAudio: () => void;
  startLive: () => void;
  stopLive: () => void;
  closeRemoteVideoStream: (username: string) => void;
}

export interface DmMeta {
  screenname: string;
  username: string;
  avatarExpression?: string;
  avatarColor?: string;
}

interface Props {
  name: string;
  password?: string;
  onClose?: () => void;
  showBackBtn?: boolean;
  hideVoiceBar?: boolean;
  externalVoice?: ExternalVoice | null;
  dmMeta?: DmMeta | null;
  activeVoiceRoom?: string;
  onLeaveAndSwitch?: (room: string) => void;
  onNavigateToRoom?: (room: string) => void;
  hideHeader?: boolean;
  membersKey?: number;
  infoKey?: number;
}

export function ChatPanel({ name, password, onClose, showBackBtn = false, hideVoiceBar = false, externalVoice, dmMeta, activeVoiceRoom, onLeaveAndSwitch, onNavigateToRoom, hideHeader = false, membersKey, infoKey }: Props) {
  const isDm = name.startsWith('dm:');
  const { currentUser } = useAuthStore();
  const c = useColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const [messages, setMessages] = useState<Message[]>(() => getCached(name));
  const [input, setInput] = useState('');
  const flatRef = useRef<FlatList>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState('已复制');
  function showToast(msg: string) {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }
  function showCopiedToast() { showToast('已复制'); }
  const containerRef = useRef<View>(null);

  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [showActions, setShowActions] = useState(false);
  const actionOpenedAt = useRef(0);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [isOwner, setIsOwner] = useState(false);
  const [myLevel, setMyLevel] = useState(0); // 2 owner, 1 room admin, 0 member (from join_result)
  const [roomHasPassword, setRoomHasPassword] = useState(!!password);
  const [isTextMuted, setIsTextMuted] = useState(false);
  const [showSetPwArea, setShowSetPwArea] = useState(false);
  const [newRoomPw, setNewRoomPw] = useState('');
  const [setPwError, setSetPwError] = useState('');

  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [containerOffset, setContainerOffset] = useState({ x: 0, y: 0 });
  const [containerW, setContainerW] = useState(0);
  // Desktop hover reaction quick bar: msgId + button page position
  const [reactionBar, setReactionBar] = useState<{ msgId: number; pageX: number; pageY: number; btnH: number } | null>(null);
  // Full emoji picker (reaction mode): positioned absolutely, not modal
  const [reactionFullPicker, setReactionFullPicker] = useState<{ msgId: number; top?: number; left?: number } | null>(null);

  const internalVoice = useVoice(externalVoice ? '' : name);
  const voice = externalVoice ?? internalVoice;
  const { inVoice, voiceMembers, isMuted, joinVoice, leaveVoice, toggleMute } = voice;

  // Track voice members for THIS room independently (externalVoice tracks voiceRoom, not name)
  const [roomVoiceMembers, setRoomVoiceMembers] = useState<import('../hooks/useVoice').VoiceMember[]>([]);

  const inVoiceHere = inVoice && (!activeVoiceRoom || activeVoiceRoom === name);
  const inVoiceElsewhere = inVoice && !!activeVoiceRoom && activeVoiceRoom !== name;
  const showVoiceBar = !hideVoiceBar && !isDm && (inVoiceHere || roomVoiceMembers.length > 0);
  const [showMembersModal, setShowMembersModal] = useState(false);

  useEffect(() => {
    loadRecentEmojis().then(setRecentEmojis);
  }, []);

  useEffect(() => {
    if (!currentUser || !name) return;
    setMessages(getCached(name));
    const socket = getSocket();

    if (isDm) {
      socket.emit('join_dm', { username: currentUser.username, dm_room: name, since: getLastTs(name) });
    } else {
      socket.emit('join', {
        username: currentUser.username,
        screenname: currentUser.screenname,
        room: name,
        password: password ?? '',
        since: getLastTs(name),
      });
      socket.once('join_result', (data: any) => {
        if (data.success) {
          socket.emit('get_members', { room: name });
          if (data.code) setRoomCode(data.code);
          if (data.members) setMemberCount(data.members.length);
          if (data.is_owner) setIsOwner(true);
          setMyLevel(data.my_level ?? 0);
        } else if (data.wrong_password) {
          Alert.alert(t('wrong-password'), data.msg);
          onClose?.();
        }
      });
    }

    // ── 当前房间的语音成员（独立追踪，不依赖 externalVoice） ──
    const onRoomVoiceView = (data: any) => {
      if (data.room && data.room !== name) return;
      setRoomVoiceMembers(data.members || []);
    };
    const onRoomVoiceJoined = (data: any) => {
      if (data.room && data.room !== name) return;
      setRoomVoiceMembers(prev => prev.some((m: any) => m.username === data.username) ? prev : [...prev, data]);
    };
    const onRoomVoiceLeft = (data: any) => {
      if (data.room && data.room !== name) return;
      setRoomVoiceMembers(prev => prev.filter((m: any) => m.username !== data.username));
    };
    const onRoomVoiceSpeaking = (data: any) => {
      if (data.room !== name) return;
      setRoomVoiceMembers(prev => prev.map((m: any) => m.username === data.username ? { ...m, isSpeaking: data.speaking } : m));
    };
    const onRoomVoiceMute = (data: any) => {
      if (data.room !== name) return;
      setRoomVoiceMembers(prev => prev.map((m: any) => m.username === data.username ? { ...m, isMuted: data.muted } : m));
    };
    const onConnect = () => {
      if (isDm) {
        socket.emit('join_dm', { username: currentUser.username, dm_room: name, since: getLastTs(name) });
      } else {
        socket.emit('join', {
          username: currentUser.username,
          screenname: currentUser.screenname,
          room: name,
          password: password ?? '',
          since: getLastTs(name),
        });
      }
    };

    socket.on('connect', onConnect);
    socket.on('voice_members_view', onRoomVoiceView);
    socket.on('voice_user_joined', onRoomVoiceJoined);
    socket.on('voice_user_left', onRoomVoiceLeft);
    socket.on('voice_speaking', onRoomVoiceSpeaking);
    socket.on('voice_mute_status', onRoomVoiceMute);

    const onTextMutedNotify = () => { showToast(t('you-are-muted')); setIsTextMuted(true); };
    const onDmBlocked = (data: any) => { if (data.room === name) showToast(t('dm-blocked')); };
    const onTextMuted = (data: any) => { if (data.room === name && data.target === currentUser.username) setIsTextMuted(true); };
    const onTextUnmuted = (data: any) => { if (data.room === name && data.target === currentUser.username) setIsTextMuted(false); };
    const onRoomPasswordChanged = (data: { room: string; has_password: boolean }) => {
      if (data.room === name) setRoomHasPassword(data.has_password);
    };
    const onSetRoomPasswordResult = (data: any) => {
      if (!data.success) { setSetPwError(data.msg || t('err-save-failed')); return; }
      setShowSetPwArea(false);
      setNewRoomPw('');
      setSetPwError('');
    };
    const onKicked = (data: any) => {
      if (data.room !== name) return;
      if (inVoiceHere) voice.leaveVoice();
      Alert.alert(t('kicked-title'), t('kicked-msg'));
      handleBack();
    };
    const onMessage = (data: any) => {
      // The socket sits in many rooms at once (all DMs, rooms visited this session)
      if (data.room !== name) return;
      const msg: Message = { ...data, isOwn: data.username === currentUser.username };
      if (!data.system) {
        cacheMsg(name, msg);
        setMessages(getCached(name).slice());
      } else {
        setMessages(prev => [...prev, msg]);
      }
    };
    const onMessageRecalled = (data: { id: number; room: string }) => {
      if (data.room !== name) return;
      patchCached(name, data.id, { recalled: true });
      setMessages(prev => prev.map(m => m.id === data.id ? { ...m, recalled: true } : m));
    };
    const onMessageEdited = (data: { id: number; text: string; room: string }) => {
      if (data.room !== name) return;
      patchCached(name, data.id, { text: data.text, edited: true });
      setMessages(prev => prev.map(m => m.id === data.id ? { ...m, text: data.text, edited: true } : m));
    };
    const onReactionUpdated = (data: { id: number; reactions: Record<string, string[]>; room: string }) => {
      if (data.room !== name) return;
      patchCached(name, data.id, { reactions: data.reactions });
      setMessages(prev => prev.map(m => m.id === data.id ? { ...m, reactions: data.reactions } : m));
    };

    socket.on('text_muted_notify', onTextMutedNotify);
    socket.on('dm_blocked', onDmBlocked);
    socket.on('text_muted', onTextMuted);
    socket.on('text_unmuted', onTextUnmuted);
    socket.on('room_password_changed', onRoomPasswordChanged);
    socket.on('set_room_password_result', onSetRoomPasswordResult);
    socket.on('kicked_from_room', onKicked);
    socket.on('message', onMessage);
    socket.on('message_recalled', onMessageRecalled);
    socket.on('message_edited', onMessageEdited);
    socket.on('reaction_updated', onReactionUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('text_muted_notify', onTextMutedNotify);
      socket.off('dm_blocked', onDmBlocked);
      socket.off('text_muted', onTextMuted);
      socket.off('text_unmuted', onTextUnmuted);
      socket.off('room_password_changed', onRoomPasswordChanged);
      socket.off('set_room_password_result', onSetRoomPasswordResult);
      socket.off('kicked_from_room', onKicked);
      socket.off('message', onMessage);
      socket.off('message_recalled', onMessageRecalled);
      socket.off('message_edited', onMessageEdited);
      socket.off('reaction_updated', onReactionUpdated);
      socket.off('voice_members_view', onRoomVoiceView);
      socket.off('voice_user_joined', onRoomVoiceJoined);
      socket.off('voice_user_left', onRoomVoiceLeft);
      socket.off('voice_speaking', onRoomVoiceSpeaking);
      socket.off('voice_mute_status', onRoomVoiceMute);
    };
  }, [currentUser, name]);

  useEffect(() => { setIsTextMuted(false); }, [name]);
  useEffect(() => { if (membersKey) setShowMembersModal(true); }, [membersKey]);
  useEffect(() => { if (infoKey) setShowRoomInfo(true); }, [infoKey]);

  function handleContainerLayout() {
    containerRef.current?.measure((_x, _y, w, _h, pageX, pageY) => {
      setContainerOffset({ x: pageX, y: pageY });
      setContainerW(w);
    });
  }

  function sendMessage() {
    const text = input.trim();
    if (!text || !currentUser || !name) return;
    getSocket().emit('message', {
      username: currentUser.username,
      screenname: currentUser.screenname,
      room: name,
      text,
    });
    setInput('');
  }

  function handleBack() {
    if (onClose) onClose();
    else router.back();
  }

  function leaveRoom() {
    setShowRoomInfo(false);
    getSocket().emit('leave_room', { username: currentUser?.username, room: name });
    handleBack();
  }

  function toggleRoomPassword() {
    if (roomHasPassword) {
      getSocket().emit('set_room_password', { requester: currentUser?.username, room: name, password: null });
    } else {
      setShowSetPwArea(v => !v);
      setSetPwError('');
    }
  }

  function submitSetRoomPassword() {
    const pw = newRoomPw.trim();
    if (!pw) { setSetPwError(t('err-pw-required')); return; }
    getSocket().emit('set_room_password', { requester: currentUser?.username, room: name, password: pw });
  }

  function handleLongPress(msg: Message) {
    if (msg.recalled) return;
    setSelectedMsg(msg);
    setShowActions(true);
    actionOpenedAt.current = Date.now();
  }

  function doRecall() {
    if (!selectedMsg) return;
    setShowActions(false);
    getSocket().emit('recall_message', { id: selectedMsg.id, username: currentUser?.username, room: name });
    setSelectedMsg(null);
  }

  function openEdit() {
    if (!selectedMsg) return;
    setEditText(selectedMsg.text);
    setEditingMsg(selectedMsg);
    setShowActions(false);
    setSelectedMsg(null);
  }

  function submitEdit() {
    if (!editingMsg || !editText.trim()) return;
    getSocket().emit('edit_message', { id: editingMsg.id, text: editText.trim(), username: currentUser?.username, room: name });
    setEditingMsg(null);
    setEditText('');
  }

  function handleReactionPress(msgId: number, emoji: string) {
    getSocket().emit('add_reaction', { id: msgId, emoji, username: currentUser?.username, room: name });
    recordRecentEmoji(emoji).then(setRecentEmojis);
  }

  const blockedSet = new Set(useBlockStore(s => s.blocked));
  const canEdit = selectedMsg?.isOwn;
  const canRecall = selectedMsg?.isOwn || myLevel >= 1;
  const feed = buildFeed(messages.filter(m => m.system || !blockedSet.has(m.username)));
  const reactionQuickList = buildReactionQuickList(recentEmojis);

  // Reaction bar absolute position (relative to container)
  let reactionBarTop = 0;
  let reactionBarLeft = 4;
  if (reactionBar) {
    const rawTop = reactionBar.pageY - containerOffset.y - REACTION_BAR_H - 8;
    reactionBarTop = rawTop < 8 ? reactionBar.pageY - containerOffset.y + reactionBar.btnH + 8 : rawTop;
    const rawLeft = reactionBar.pageX - containerOffset.x - 160;
    // clamp so the bar (≈360px wide) stays within the container
    reactionBarLeft = Math.min(Math.max(4, rawLeft), Math.max(4, (containerW || 800) - 364));
  }

  return (
    <View ref={containerRef} style={[s.container, { backgroundColor: c.bg }]} onLayout={handleContainerLayout}>
      {/* 顶栏 */}
      {!hideHeader && <View style={[s.header, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
        {showBackBtn && (
          <TouchableOpacity onPress={handleBack} style={s.backBtn}>
            <IconChevronLeft size={20} color={c.accent} />
          </TouchableOpacity>
        )}
        {isDm ? (
          <View style={s.titleBtn} pointerEvents="box-none">
            {dmMeta && (
              <AvatarView
                expression={dmMeta.avatarExpression}
                color={dmMeta.avatarColor}
                username={dmMeta.username}
                screenname={dmMeta.screenname}
                size={24}
              />
            )}
            <Text style={[s.title, { color: c.text }]} numberOfLines={1}>
              {dmMeta?.screenname ?? name}
            </Text>
          </View>
        ) : (
          <View style={s.titleBtn} pointerEvents="box-none">
            <IconGroup size={18} color={c.text} />
            <Text style={[s.title, { color: c.text }]} numberOfLines={1}>{name}</Text>
            <TouchableOpacity onPress={() => setShowRoomInfo(true)} activeOpacity={0.6} style={s.infoBtn}>
              <IconInfo size={14} color={c.textMuted} />
            </TouchableOpacity>
          </View>
        )}
        {!isDm && (inVoice || roomVoiceMembers.length > 0) && (() => {
          const pillMembers = inVoice ? voiceMembers : roomVoiceMembers;
          const speaker = pillMembers.find((m: any) => m.isSpeaking);
          const pillUser = speaker ?? pillMembers[0];
          const pillPress = inVoiceElsewhere
            ? () => { onNavigateToRoom?.(activeVoiceRoom!); }
            : () => setShowMembersModal(true);
          return (
            <TouchableOpacity
              onPress={pillPress}
              style={[s.voicePill, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' }]}
              activeOpacity={0.7}
            >
              <IconMic size={13} color={c.accent} />
              {pillUser && (
                <AvatarView
                  username={pillUser.username}
                  screenname={pillUser.screenname}
                  color={pillUser.avatar_color}
                  size={18}
                />
              )}
              <Text style={[s.voicePillCount, { color: c.accent }]}>
                ({pillMembers.length})
              </Text>
            </TouchableOpacity>
          );
        })()}
        {!isDesktop && !isDm && (
          <TouchableOpacity onPress={() => setShowMembersModal(true)} style={s.backBtn} activeOpacity={0.7}>
            <IconGroup size={20} color={c.textMuted} />
          </TouchableOpacity>
        )}
      </View>}

      {/* 语音栏（手机端） */}
      {showVoiceBar && (
        <VoiceBar
          inVoice={inVoiceHere}
          inVoiceElsewhere={inVoiceElsewhere}
          activeVoiceRoom={activeVoiceRoom}
          voiceMembers={roomVoiceMembers}
          isMuted={isMuted}
          currentUsername={currentUser?.username}
          onJoin={() => {
            if (inVoiceElsewhere && onLeaveAndSwitch) {
              Alert.alert(
                '切换语音',
                `你当前在「${activeVoiceRoom}」语音中，切换到「${name}」？`,
                [
                  { text: '取消', style: 'cancel' },
                  { text: '切换', onPress: () => onLeaveAndSwitch(name) },
                ]
              );
            } else {
              joinVoice();
            }
          }}
          onLeave={leaveVoice}
          onToggleMute={toggleMute}
          c={c}
        />
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatRef}
          data={[...feed].reverse()}
          inverted
          initialNumToRender={feed.length || 20}
          keyExtractor={item => (item as any)._id ?? String((item as Message).id)}
          renderItem={({ item }) => {
            if ((item as any)._type === 'sep') {
              const sep = item as { time: string };
              return (
                <View style={s.timeSep}>
                  <View style={[s.timeSepLine, { backgroundColor: c.border }]} />
                  <Text style={[s.timeSepText, { color: c.textMuted, backgroundColor: c.bg }]}>{sep.time}</Text>
                  <View style={[s.timeSepLine, { backgroundColor: c.border }]} />
                </View>
              );
            }
            const msg = item as Message;
            if (msg.system) {
              return (
                <Text style={[s.sysMsg, { color: c.textMuted }]}>{msg.text}</Text>
              );
            }
            if (msg.meta?.invite) {
              const inv = msg.meta.invite;
              return (
                <View style={[s.inviteCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Text style={[s.inviteTitle, { color: c.text }]}>{msg.text}</Text>
                  <TouchableOpacity
                    style={[s.inviteBtn, { backgroundColor: c.accent }]}
                    onPress={() => {
                      if (onNavigateToRoom) onNavigateToRoom(inv.room);
                      else router.push({ pathname: '/(main)/room/[name]', params: { name: inv.room } });
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={s.inviteBtnText}>{inv.room}</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const canEditMsg = msg.isOwn;
            const canRecallMsg = msg.isOwn || myLevel >= 1;
            return (
              <MessageBubble
                msg={msg}
                currentUsername={currentUser?.username}
                onLongPress={isDesktop ? undefined : () => handleLongPress(msg)}
                onReactionPress={(emoji) => handleReactionPress(msg.id, emoji)}
                isDesktop={isDesktop}
                onReactionBtnPress={isDesktop ? (pageX, pageY, btnH) => {
                  // Toggle: clicking 😊 again on same message closes the bar
                  setReactionBar(prev =>
                    prev?.msgId === msg.id ? null : { msgId: msg.id, pageX, pageY, btnH }
                  );
                  setShowInputEmojiPicker(false);
                } : undefined}
                onEdit={isDesktop && canEditMsg ? () => {
                  setEditText(msg.text);
                  setEditingMsg(msg);
                } : undefined}
                onRecall={isDesktop && canRecallMsg ? () => {
                  getSocket().emit('recall_message', { id: msg.id, username: currentUser?.username, room: name });
                } : undefined}
              />
            );
          }}
          contentContainerStyle={s.msgList}
        />

        {/* 输入区 */}
        {editingMsg ? (
          <View style={[s.editBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            <Text style={[s.editLabel, { color: c.accent }]}>{t('edit-message')}</Text>
            <TextInput
              style={[s.editInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              value={editText}
              onChangeText={setEditText}
              autoFocus
              multiline
            />
            <View style={s.editActions}>
              <TouchableOpacity
                onPress={() => { setEditingMsg(null); setEditText(''); }}
                style={[s.editCancelBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
              >
                <Text style={[s.editCancelText, { color: c.text }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitEdit} style={[s.editSaveBtn, { backgroundColor: c.accent }]}>
                <Text style={s.editSaveText}>{t('save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : isTextMuted ? (
          <View style={[s.mutedArea, { backgroundColor: c.bg, borderTopColor: c.border }]}>
            <Text style={[s.mutedText, { color: c.danger }]}>🔇 {t('you-are-muted')}</Text>
          </View>
        ) : (
          <View style={[s.inputArea, { backgroundColor: c.bg }]}>
            <TouchableOpacity
              style={s.emojiOpenBtn}
              onPress={() => {
                setShowInputEmojiPicker(v => !v);
                setReactionBar(null);
              }}
              activeOpacity={0.7}
            >
              <IconEmoji size={22} color={showInputEmojiPicker ? c.accent : c.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={[s.input, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e8', color: c.text }]}
              placeholder={t('ph-message')}
              placeholderTextColor={c.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              multiline
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault?.();
                  sendMessage();
                }
              }}
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: c.accent }, !input.trim() && s.sendBtnDisabled]}
              onPress={sendMessage}
              activeOpacity={0.8}
            >
              <IconSend size={17} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── 输入框表情选择器 ── 紧贴按钮上方 */}
      {showInputEmojiPicker && (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setShowInputEmojiPicker(false)}
            activeOpacity={0}
          />
          <EmojiPicker
            style={{ position: 'absolute', bottom: 64, left: 8, zIndex: 200 } as any}
            onSelect={(emoji) => {
              setInput(prev => prev + emoji);
              setShowInputEmojiPicker(false);
            }}
          />
        </>
      )}

      {/* ── Reaction quick bar ── 悬浮小气泡，桌面端hover用 */}
      {reactionBar && (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setReactionBar(null)}
            activeOpacity={0}
          />
          <ReactionQuickBar
            style={{ position: 'absolute', top: reactionBarTop, left: reactionBarLeft, zIndex: 300 } as any}
            emojis={reactionQuickList}
            c={c}
            onSelect={(emoji) => { handleReactionPress(reactionBar.msgId, emoji); setReactionBar(null); }}
            onMore={() => {
              const id = reactionBar.msgId;
              let pickerTop = reactionBarTop - 448;
              if (pickerTop < 8) pickerTop = reactionBarTop + REACTION_BAR_H + 8;
              const pickerLeft = Math.min(Math.max(4, reactionBarLeft), (containerW || 800) - 352);
              setReactionBar(null);
              setReactionFullPicker({ msgId: id, top: pickerTop, left: pickerLeft });
            }}
          />
        </>
      )}

      {/* ── 完整表情选择器 ── reaction ＋ 按钮触发，悬浮定位不全屏 */}
      {reactionFullPicker && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setReactionFullPicker(null)} activeOpacity={0} />
          <EmojiPicker
            style={[
              { position: 'absolute', zIndex: 200 } as any,
              reactionFullPicker.top != null
                ? { top: reactionFullPicker.top, left: reactionFullPicker.left ?? 4 }
                : { bottom: 64, left: 8 },
            ]}
            onSelect={(emoji) => {
              handleReactionPress(reactionFullPicker.msgId, emoji);
              setReactionFullPicker(null);
            }}
          />
        </>
      )}

      {/* 操作菜单 — 手机端横条 */}
      <Modal visible={!isDesktop && showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}>
        <View style={s.overlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              if (Date.now() - actionOpenedAt.current < 400) return;
              setShowActions(false); setSelectedMsg(null);
            }}
            activeOpacity={1}
          />
          <View style={[s.compactBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
            {reactionQuickList.slice(0, 4).map(e => (
              <TouchableOpacity
                key={e}
                style={s.compactBtn}
                onPress={() => {
                  if (selectedMsg) handleReactionPress(selectedMsg.id, e);
                  setShowActions(false);
                  setSelectedMsg(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.compactIcon}>{e}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={s.compactBtn}
              onPress={() => {
                const msgId = selectedMsg?.id ?? null;
                setShowActions(false);
                setSelectedMsg(null);
                if (msgId !== null) setReactionFullPicker({ msgId });
              }}
              activeOpacity={0.7}
            >
              <Text style={s.compactIcon}>＋</Text>
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity style={s.compactBtn} onPress={openEdit} activeOpacity={0.7}>
                <Text style={s.compactIcon}>✏️</Text>
                <Text style={[s.compactLabel, { color: c.textMuted }]}>{t('edit')}</Text>
              </TouchableOpacity>
            )}
            {canRecall && (
              <TouchableOpacity style={s.compactBtn} onPress={doRecall} activeOpacity={0.7}>
                <Text style={s.compactIcon}>🗑</Text>
                <Text style={[s.compactLabel, { color: c.danger }]}>{t('recall')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* 房间信息 */}
      <Modal visible={showRoomInfo} transparent animationType="fade" onRequestClose={() => setShowRoomInfo(false)}>
        <TouchableOpacity style={s.pickerOverlay} onPress={() => setShowRoomInfo(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.roomInfoBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.roomInfoTitle, { color: c.text }]}># {name}</Text>
            {!!roomCode && (
              <View style={s.roomInfoRow}>
                <Text style={[s.roomInfoLabel, { color: c.textMuted }]}>{t('room-code')}</Text>
                <View style={s.roomCodeRight}>
                  <Text style={[s.roomInfoVal, { color: c.text }]}>{roomCode}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        navigator.clipboard?.writeText(roomCode);
                      }
                      showCopiedToast();
                    }}
                    style={[s.copyBtn, { backgroundColor: c.accentBg }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.copyBtnText, { color: c.accent }]}>复制</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={s.roomInfoRow}>
              <Text style={[s.roomInfoLabel, { color: c.textMuted }]}>{t('members')}</Text>
              <Text style={[s.roomInfoVal, { color: c.text }]}>{memberCount}{t('people-unit') ? ' ' + t('people-unit') : ''}</Text>
            </View>

            {isOwner && (
              <View style={s.roomInfoAdminArea}>
                <TouchableOpacity
                  style={[s.roomInfoAdminBtn, { borderColor: c.border }]}
                  onPress={toggleRoomPassword}
                  activeOpacity={0.8}
                >
                  <Text style={[s.roomInfoAdminBtnText, { color: c.text }]}>
                    {roomHasPassword ? t('remove-room-pw') : t('set-room-pw')}
                  </Text>
                </TouchableOpacity>
                {showSetPwArea && (
                  <View style={s.setPwArea}>
                    {!!setPwError && <Text style={{ color: c.danger, fontSize: 13 }}>{setPwError}</Text>}
                    <TextInput
                      style={[s.roomInfoInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                      placeholder={t('ph-set-room-pw')}
                      placeholderTextColor={c.textMuted}
                      value={newRoomPw}
                      onChangeText={setNewRoomPw}
                      secureTextEntry
                      autoComplete="new-password"
                      textContentType="newPassword"
                      onSubmitEditing={submitSetRoomPassword}
                    />
                    <TouchableOpacity
                      style={[s.roomInfoCloseBtn, { backgroundColor: c.accent }]}
                      onPress={submitSetRoomPassword}
                      activeOpacity={0.86}
                    >
                      <Text style={s.roomInfoCloseBtnText}>{t('confirm-set-pw')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={[s.roomInfoCloseBtn, { backgroundColor: c.accent }]} onPress={() => setShowRoomInfo(false)}>
              <Text style={s.roomInfoCloseBtnText}>{t('close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.roomInfoLeaveBtn, { borderColor: c.danger }]} onPress={leaveRoom}>
              <Text style={[s.roomInfoLeaveBtnText, { color: c.danger }]}>{t('leave-room')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 手机端成员抽屉（从右滑入） */}
      {showMembersModal && (
        <RightDrawer onClose={() => setShowMembersModal(false)} c={c}>
          <MembersPanel
            room={name}
            voice={voice}
            roomVoiceMembers={roomVoiceMembers}
            currentUsername={currentUser?.username}
            isVoiceHere={inVoiceHere}
            onJoinVoice={() => {
              if (inVoiceElsewhere && onLeaveAndSwitch) {
                Alert.alert('切换语音', `你当前在「${activeVoiceRoom}」语音中，切换到「${name}」？`, [
                  { text: '取消', style: 'cancel' },
                  { text: '切换', onPress: () => onLeaveAndSwitch(name) },
                ]);
              } else {
                voice.joinVoice();
              }
            }}
          />
        </RightDrawer>
      )}

      {/* 已复制 toast */}
      <Animated.View pointerEvents="none" style={[s.toast, { opacity: toastOpacity }]}>
        <Text style={s.toastText}>{toastMsg}</Text>
      </Animated.View>
    </View>
  );
}

// ── Reaction quick bar ────────────────────────────────────────
// Floating pill shown above/below message on desktop 😊 click

function ReactionQuickBar({ style, emojis, c, onSelect, onMore }: {
  style: any;
  emojis: string[];
  c: ReturnType<typeof useColors>;
  onSelect: (emoji: string) => void;
  onMore: () => void;
}) {
  return (
    <View style={[rqs.bar, { backgroundColor: c.surface }, style]}>
      {emojis.map(e => (
        <TouchableOpacity key={e} style={rqs.btn} onPress={() => onSelect(e)} activeOpacity={0.7}>
          <Text style={rqs.emoji}>{e}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={[rqs.btn, rqs.moreBtn, { borderLeftColor: c.border }]} onPress={onMore} activeOpacity={0.7}>
        <Text style={[rqs.more, { color: c.textMuted }]}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const rqs = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4, gap: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  btn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  moreBtn: { borderLeftWidth: StyleSheet.hairlineWidth, marginLeft: 2 },
  emoji: { fontSize: 22 },
  more: { fontSize: 17, fontWeight: 'bold' as any },
});

// ── 语音栏 ────────────────────────────────────────────────────

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
      <Text style={[vs.label, { color: c.accent }]}>🔊 {t('voice-chat')}{voiceMembers.length > 0 ? ` (${voiceMembers.length})` : ''}</Text>
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
            {inVoiceElsewhere ? `切换` : t('join-voice')}
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

const s = StyleSheet.create({
  container: { flex: 1 },

  header: {
    height: 50, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: Spacing.xs, borderRadius: 6 },
  voicePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 6 },
  voicePillCount: { fontSize: 12, fontWeight: '600' },
  titleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1, fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  infoBtn: { padding: 4, opacity: 0.5 },

  timeSep: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, paddingHorizontal: Spacing.lg },
  sysMsg: { textAlign: 'center', fontSize: 12, paddingVertical: 4, paddingHorizontal: Spacing.lg, opacity: 0.55 },
  inviteCard: { margin: 12, borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  inviteTitle: { fontSize: 13 },
  inviteBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  inviteBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' as any },
  timeSepLine: { flex: 1, height: StyleSheet.hairlineWidth },
  timeSepText: { fontSize: 11, paddingHorizontal: 8, color: 'gray' },

  msgList: { paddingVertical: Spacing.sm },

  inputArea: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.lg, paddingVertical: 10, paddingBottom: 14,
  },
  emojiOpenBtn: { padding: 2, borderRadius: 6 },
  input: {
    flex: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, maxHeight: 120,
  },
  sendBtn: {
    borderRadius: 10, width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },

  editBar: { borderTopWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  editLabel: { fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  editInput: { borderRadius: Radius.md, padding: 10, fontSize: 15, borderWidth: 1, maxHeight: 120 },
  editActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  editCancelBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 8, borderRadius: 5 },
  editCancelText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  editSaveBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 8, borderRadius: 5 },
  editSaveText: { color: '#fff', fontSize: 13, fontWeight: String(Fonts.semibold) as any },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },

  compactBar: {
    flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10, paddingHorizontal: Spacing.md, paddingBottom: 22,
  },
  compactBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  compactIcon: { fontSize: 22 },
  compactLabel: { fontSize: 11, marginTop: 3, fontWeight: String(Fonts.medium) as any },

  roomInfoBox: {
    margin: 40, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md,
    alignSelf: 'center', width: 300,
  },
  roomInfoTitle: { fontSize: 18, fontWeight: String(Fonts.bold) as any },
  roomInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomInfoLabel: { fontSize: 13 },
  roomInfoVal: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  roomInfoCloseBtn: { borderRadius: Radius.md, padding: 10, alignItems: 'center', marginTop: Spacing.sm },
  roomInfoCloseBtnText: { color: '#fff', fontWeight: String(Fonts.semibold) as any },
  roomInfoLeaveBtn: { borderRadius: Radius.md, padding: 10, alignItems: 'center', borderWidth: 1, width: '100%' },
  roomInfoLeaveBtnText: { fontWeight: String(Fonts.semibold) as any },

  roomInfoAdminArea: { gap: Spacing.sm, width: '100%' },
  roomInfoAdminBtn: { borderRadius: Radius.md, padding: 10, alignItems: 'center', borderWidth: 1, width: '100%' },
  roomInfoAdminBtnText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  setPwArea: { gap: Spacing.sm },
  roomInfoInput: { borderRadius: Radius.md, padding: 11, fontSize: 15, borderWidth: 1 },
  roomCodeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  copyBtnText: { fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  toast: {
    position: 'absolute', alignSelf: 'center', bottom: 80,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  toastText: { color: '#fff', fontSize: 14 },
  membersOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  membersSheet: { width: '100%', maxHeight: '80%', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  mutedArea: { paddingHorizontal: Spacing.lg, paddingVertical: 16, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  mutedText: { fontSize: 14, fontWeight: String(Fonts.medium) as any },
});

// ── 右滑抽屉 ──────────────────────────────────────────────
function RightDrawer({ onClose, c, children }: { onClose: () => void; c: ReturnType<typeof useColors>; children: ReactNode }) {
  const DRAWER_W = 230;
  const translateX = useRef(new Animated.Value(DRAWER_W)).current;

  useEffect(() => {
    Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  }, []);

  function close() {
    Animated.timing(translateX, { toValue: DRAWER_W, duration: 180, useNativeDriver: true }).start(onClose);
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} activeOpacity={1} onPress={close} />
        <Animated.View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: DRAWER_W, transform: [{ translateX }], backgroundColor: c.surface }}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

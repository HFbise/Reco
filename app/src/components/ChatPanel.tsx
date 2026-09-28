import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Animated, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { showAlert } from '../lib/alert';
import { useAuthStore } from '../store/authStore';
import { useBlockStore } from '../store/blockStore';
import { useColors } from '../hooks/useColors';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useT } from '../hooks/useT';
import { useVoice } from '../hooks/useVoice';
import { useRoomChat, type ChatToast } from '../hooks/useRoomChat';
import { loadRecentEmojis, recordRecentEmoji, buildReactionQuickList } from '../lib/recentEmojis';
import type { Message } from './MessageBubble';
import { EmojiPicker } from './EmojiPicker';
import { MembersPanel } from './MembersPanel';
import { ChatHeader } from './chat/ChatHeader';
import { MessageList } from './chat/MessageList';
import { Composer } from './chat/Composer';
import { RoomInfoModal } from './chat/RoomInfoModal';
import { MessageActionsSheet } from './chat/MessageActionsSheet';
import { ReactionQuickBar } from './chat/ReactionQuickBar';
import { RightDrawer } from './chat/RightDrawer';
import { VoiceBar } from './chat/VoiceBar';
import type { DmMeta, ExternalVoice } from './chat/types';

export type { DmMeta, ExternalVoice } from './chat/types';

const REACTION_BAR_H = 54;
const TOAST_TEXT = {
  'muted': 'you-are-muted',
  'dm-blocked': 'dm-blocked',
  'rate-limited': 'rate-limited',
  'send-failed': 'send-failed',
} as const satisfies Record<ChatToast, string>;

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
  /** Bumped by a parent to open the members drawer / room info from outside */
  membersKey?: number;
  infoKey?: number;
}

export function ChatPanel({
  name, password, onClose, showBackBtn = false, hideVoiceBar = false, externalVoice, dmMeta,
  activeVoiceRoom, onLeaveAndSwitch, onNavigateToRoom, hideHeader = false, membersKey, infoKey,
}: Props) {
  const isDm = name.startsWith('dm:');
  const { currentUser } = useAuthStore();
  const isGuest = !!currentUser?.guest;
  const c = useColors();
  const t = useT();
  const isDesktop = useIsDesktop();

  // ── transient UI state ──
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [actionTarget, setActionTarget] = useState<{ msg: Message; at: number } | null>(null);
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [container, setContainer] = useState({ x: 0, y: 0, w: 0 });
  const containerRef = useRef<View>(null);
  // Desktop: quick reaction pill anchored to a message's 😊 button, and the full picker
  const [reactionBar, setReactionBar] = useState<{ msgId: number; pageX: number; pageY: number; btnH: number } | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{ msgId: number; top?: number; left?: number } | null>(null);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toast, setToast] = useState('');
  function showToast(text: string) {
    setToast(text);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }

  function handleBack() {
    if (onClose) onClose();
    else router.back();
  }

  // ── voice ──
  const internalVoice = useVoice(externalVoice ? '' : name);
  const voice = externalVoice ?? internalVoice;
  const inVoiceHere = voice.inVoice && (!activeVoiceRoom || activeVoiceRoom === name);
  const inVoiceElsewhere = voice.inVoice && !!activeVoiceRoom && activeVoiceRoom !== name;

  // ── server state for this room ──
  const lastSentRef = useRef('');
  const chat = useRoomChat({
    name,
    password,
    onRemoved: (reason) => {
      if (inVoiceHere) voice.leaveVoice();
      if (reason === 'kicked') showAlert(t('kicked-title'), t('kicked-msg'));
      else if (!chat.room.isOwner) showAlert(t('room-closed-title'), t('room-closed-msg'));
      handleBack();
    },
    onJoinFailed: (reply) => {
      // Wrong password, room gone, kicked, server error: there is nothing to show here
      showAlert(reply.wrong_password ? t('wrong-password') : t('join-failed'), t.server(reply, 'join-failed'));
      handleBack();
    },
    onToast: (kind) => {
      showToast(t(TOAST_TEXT[kind]));
      // Not delivered: give the text back rather than losing it
      if (kind === 'send-failed' || kind === 'rate-limited') setInput((cur) => cur || lastSentRef.current);
    },
  });
  const showVoiceBar = !hideVoiceBar && !isDm && !isGuest && (inVoiceHere || chat.voiceMembers.length > 0);

  useEffect(() => { loadRecentEmojis().then(setRecentEmojis); }, []);
  useEffect(() => { if (membersKey) setShowMembers(true); }, [membersKey]);
  useEffect(() => { if (infoKey) setShowRoomInfo(true); }, [infoKey]);

  function joinVoiceHere() {
    if (inVoiceElsewhere && onLeaveAndSwitch) {
      showAlert(t('switch-voice-title'), t('switch-voice-msg', { from: t.room(activeVoiceRoom!), to: t.room(name) }), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('switch'), onPress: () => onLeaveAndSwitch(name) },
      ]);
    } else {
      voice.joinVoice();
    }
  }

  function react(msgId: number, emoji: string) {
    chat.react(msgId, emoji);
    recordRecentEmoji(emoji).then(setRecentEmojis);
  }

  function send() {
    lastSentRef.current = input;
    chat.send(input);
    setInput('');
  }

  function saveEdit() {
    if (editing) chat.edit(editing.id, editing.text);
    setEditing(null);
  }

  function openRoom(room: string) {
    if (onNavigateToRoom) onNavigateToRoom(room);
    else router.push({ pathname: '/(main)/room/[name]', params: { name: room } });
  }

  // ── desktop reaction popups: position relative to this panel ──
  const quickEmojis = buildReactionQuickList(recentEmojis);
  let barTop = 0;
  let barLeft = 4;
  if (reactionBar) {
    const rawTop = reactionBar.pageY - container.y - REACTION_BAR_H - 8;
    barTop = rawTop < 8 ? reactionBar.pageY - container.y + reactionBar.btnH + 8 : rawTop;
    // keep the ~360px bar inside the panel
    barLeft = Math.min(Math.max(4, reactionBar.pageX - container.x - 160), Math.max(4, (container.w || 800) - 364));
  }

  const blocked = new Set(useBlockStore((s) => s.blocked));
  const visible = chat.messages.filter((m) => m.system || !blocked.has(m.username));
  const target = actionTarget?.msg;

  return (
    <View
      ref={containerRef}
      style={[s.container, { backgroundColor: c.bg }]}
      onLayout={() => containerRef.current?.measure((_x, _y, w, _h, pageX, pageY) => setContainer({ x: pageX, y: pageY, w }))}
    >
      {!hideHeader && (
        <ChatHeader
          name={name}
          dmMeta={dmMeta}
          memberCount={chat.room.memberCount}
          code={chat.room.code}
          showBackBtn={showBackBtn}
          onBack={handleBack}
          onOpenInfo={() => setShowRoomInfo(true)}
          onOpenMembers={() => setShowMembers(true)}
          voicePillMembers={voice.inVoice ? voice.voiceMembers : chat.voiceMembers}
          onVoicePillPress={inVoiceElsewhere ? () => onNavigateToRoom?.(activeVoiceRoom!) : () => setShowMembers(true)}
          showMembersButton={!isDesktop}
        />
      )}

      {showVoiceBar && (
        <VoiceBar
          inVoice={inVoiceHere}
          inVoiceElsewhere={inVoiceElsewhere}
          activeVoiceRoom={activeVoiceRoom}
          voiceMembers={chat.voiceMembers}
          isMuted={voice.isMuted}
          currentUsername={currentUser?.username}
          onJoin={joinVoiceHere}
          onLeave={voice.leaveVoice}
          onToggleMute={voice.toggleMute}
          c={c}
        />
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MessageList
          messages={visible}
          currentUsername={currentUser?.username}
          isDesktop={isDesktop}
          readOnly={isGuest}
          canModerate={chat.room.myLevel >= 1}
          hasOlder={chat.hasOlder}
          loadingOlder={chat.loadingOlder}
          onLoadOlder={chat.loadOlder}
          onReact={react}
          onLongPress={(msg) => { if (!msg.recalled) setActionTarget({ msg, at: Date.now() }); }}
          onReactionButton={(msg, pageX, pageY, btnH) => {
            // clicking 😊 again on the same message closes the bar
            setReactionBar((prev) => (prev?.msgId === msg.id ? null : { msgId: msg.id, pageX, pageY, btnH }));
            setShowInputEmoji(false);
          }}
          onEdit={(msg) => setEditing({ id: msg.id, text: msg.text })}
          onRecall={(msg) => chat.recall(msg.id)}
          onOpenRoom={openRoom}
        />
        <Composer
          input={input}
          onChangeInput={setInput}
          onSend={send}
          emojiOpen={showInputEmoji}
          onToggleEmoji={() => { setShowInputEmoji((v) => !v); setReactionBar(null); }}
          editText={editing?.text ?? null}
          onChangeEdit={(text) => setEditing((e) => (e ? { ...e, text } : e))}
          onSaveEdit={saveEdit}
          onCancelEdit={() => setEditing(null)}
          isMuted={chat.isTextMuted}
          isGuest={isGuest}
        />
      </KeyboardAvoidingView>

      {showInputEmoji && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowInputEmoji(false)} activeOpacity={0} />
          <EmojiPicker
            style={{ position: 'absolute', bottom: 64, left: 8, zIndex: 200 } as any}
            onSelect={(emoji) => { setInput((prev) => prev + emoji); setShowInputEmoji(false); }}
          />
        </>
      )}

      {reactionBar && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setReactionBar(null)} activeOpacity={0} />
          <ReactionQuickBar
            style={{ position: 'absolute', top: barTop, left: barLeft, zIndex: 300 } as any}
            emojis={quickEmojis}
            c={c}
            onSelect={(emoji) => { react(reactionBar.msgId, emoji); setReactionBar(null); }}
            onMore={() => {
              let top = barTop - 448;
              if (top < 8) top = barTop + REACTION_BAR_H + 8;
              const left = Math.min(Math.max(4, barLeft), (container.w || 800) - 352);
              setReactionPicker({ msgId: reactionBar.msgId, top, left });
              setReactionBar(null);
            }}
          />
        </>
      )}

      {reactionPicker && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setReactionPicker(null)} activeOpacity={0} />
          <EmojiPicker
            style={[
              { position: 'absolute', zIndex: 200 } as any,
              reactionPicker.top != null ? { top: reactionPicker.top, left: reactionPicker.left ?? 4 } : { bottom: 64, left: 8 },
            ]}
            onSelect={(emoji) => { react(reactionPicker.msgId, emoji); setReactionPicker(null); }}
          />
        </>
      )}

      <MessageActionsSheet
        message={isDesktop ? null : target ?? null}
        openedAt={actionTarget?.at ?? 0}
        quickEmojis={quickEmojis}
        canEdit={!!target?.isOwn}
        canRecall={!!target && (target.isOwn || chat.room.myLevel >= 1)}
        onClose={() => setActionTarget(null)}
        onReact={(emoji) => { if (target) react(target.id, emoji); setActionTarget(null); }}
        onMoreEmojis={() => { if (target) setReactionPicker({ msgId: target.id }); setActionTarget(null); }}
        onEdit={() => { if (target) setEditing({ id: target.id, text: target.text }); setActionTarget(null); }}
        onRecall={() => { if (target) chat.recall(target.id); setActionTarget(null); }}
      />

      <RoomInfoModal
        visible={showRoomInfo}
        name={name}
        room={chat.room}
        onClose={() => setShowRoomInfo(false)}
        onLeave={() => { setShowRoomInfo(false); chat.leave(); handleBack(); }}
        onCloseRoom={() => { setShowRoomInfo(false); chat.close(); }}
        onSetPassword={chat.setRoomPassword}
        onCopied={() => showToast(t('copied'))}
      />

      {showMembers && (
        <RightDrawer onClose={() => setShowMembers(false)} c={c}>
          <MembersPanel
            room={name}
            voice={isGuest ? undefined : voice}
            roomVoiceMembers={chat.voiceMembers}
            currentUsername={currentUser?.username}
            isVoiceHere={inVoiceHere}
            onJoinVoice={joinVoiceHere}
          />
        </RightDrawer>
      )}

      <Animated.View pointerEvents="none" style={[s.toast, { opacity: toastOpacity }]}>
        <Text style={s.toastText}>{toast}</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  toast: {
    position: 'absolute', alignSelf: 'center', bottom: 80,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  toastText: { color: '#fff', fontSize: 14 },
});

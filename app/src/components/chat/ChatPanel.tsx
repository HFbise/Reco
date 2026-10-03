import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { showAlert } from '../../lib/alert';
import { getSocket } from '../../lib/socket';
import { confirmReportMessage } from '../../lib/reports';
import { LOBBY_ID } from '../../lib/i18n';
import { buildReactionQuickList, loadRecentEmojis, recordRecentEmoji } from '../../lib/recentEmojis';
import { useAuthStore } from '../../store/authStore';
import { usePeopleStore } from '../../store/peopleStore';
import { useDraftStore } from '../../store/draftStore';
import { useColors } from '../../hooks/useColors';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useT } from '../../hooks/useT';
import { useVoice } from '../../hooks/useVoice';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { usePins } from '../../hooks/usePins';
import { useRoomChat, type ChatToast } from '../../hooks/useRoomChat';
import { EmojiPicker } from '../emoji/EmojiPicker';
import { ProfileCardHost } from '../members/ProfileCardHost';
import { useCardStore } from '../../store/cardStore';
import { MembersPanel } from '../MembersPanel';
import { ChatCard } from './ChatCard';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { MessageActionsSheet } from './MessageActionsSheet';
import { PinnedBar } from './PinnedBar';
import { MessageList, type MessageListHandle } from './MessageList';
import { RightDrawer } from './RightDrawer';
import { useJumpToMessage } from './useJumpToMessage';
import { usePhotoSending } from './usePhotoSending';
import { useReactionPopovers, type PanelBox } from './useReactionPopovers';
import { useToast } from './useToast';
import type { Message } from './message/types';
import type { DmMeta, ExternalVoice } from './types';

export type { DmMeta, ExternalVoice } from './types';

// Opened with more unread messages than this: start at the first one instead of the newest
const UNREAD_JUMP = 8;

const TOAST_TEXT = {
  'muted': 'you-are-muted',
  'dm-blocked': 'dm-blocked',
  'dm-not-allowed': 'dm-not-allowed',
  'rate-limited': 'rate-limited',
  'send-failed': 'send-failed',
} as const satisfies Record<ChatToast, string>;

interface Props {
  /** Room name, or a DM id ("dm:alice:bob") */
  name: string;
  password?: string;
  dmMeta?: DmMeta | null;
  /** Back to the list (otherwise router.back) */
  onClose?: () => void;
  showBackBtn?: boolean;
  /** The voice connection the screen keeps across chats (else this panel has its own) */
  externalVoice?: ExternalVoice | null;
  /** The room whose voice channel you're in, if it's another one */
  activeVoiceRoom?: string;
  onLeaveAndSwitch?: (room: string) => void;
  onNavigateToRoom?: (room: string) => void;
  /** Bumped by a parent to open the members drawer from outside */
  membersKey?: number;
}

/** An open room or DM: header, messages, the message box, and everything that opens over them. */
export function ChatPanel(p: Props) {
  const { name } = p;
  const me = useAuthStore((s) => s.currentUser);
  const isGuest = !!me?.guest;
  const c = useColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const toast = useToast();
  const showPerson = useCardStore((s) => s.show);

  // What's being written: a new message (maybe answering one), or an edit
  // The message box starts with what was left unsent here, and keeps it as it changes
  const [input, setInput] = useState(() => useDraftStore.getState().drafts[name] ?? '');
  useEffect(() => {
    const timer = setTimeout(() => useDraftStore.getState().setDraft(name, input), 300);
    return () => clearTimeout(timer);
  }, [name, input]);
  const latestInput = useRef(input);
  latestInput.current = input;
  // Leaving the chat within those 300 ms still keeps it
  useEffect(() => () => useDraftStore.getState().setDraft(name, latestInput.current), [name]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);

  // What's open over the chat
  const [showCard, setShowCard] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const [sheetFor, setSheetFor] = useState<{ msg: Message; at: number } | null>(null);
  useEffect(() => { if (p.membersKey) setShowMembers(true); }, [p.membersKey]);

  const back = () => (p.onClose ? p.onClose() : router.back());

  // Voice: the screen's connection if it has one, else this panel's own (DMs have no voice)
  const isDm = name.startsWith('dm:');
  const ownVoice = useVoice(p.externalVoice || isDm ? '' : name);
  // Who can be @mentioned: the room's members (DMs have no mentions)
  const members = useRoomMembers(isDm || isGuest ? '' : name);
  const voice = p.externalVoice ?? ownVoice;
  const inVoiceHere = voice.inVoice && (!p.activeVoiceRoom || p.activeVoiceRoom === name);
  const inVoiceElsewhere = voice.inVoice && !!p.activeVoiceRoom && p.activeVoiceRoom !== name;

  const chat = useRoomChat({
    name,
    password: p.password,
    onRemoved: (reason) => {
      if (inVoiceHere) voice.leaveVoice();
      if (reason === 'kicked') showAlert(t('kicked-title'), t('kicked-msg'));
      else if (!chat.room.isOwner) showAlert(t('room-closed-title'), t('room-closed-msg'));
      back();
    },
    onJoinFailed: (reply) => {
      // Wrong password, room gone, kicked, server error: there's nothing to show here
      showAlert(reply.wrong_password ? t('wrong-password') : t('join-failed'), t.server(reply, 'join-failed'));
      back();
    },
    // A message that wasn't delivered stays in the chat, marked, to send again
    onToast: (kind) => toast.show(t(TOAST_TEXT[kind])),
  });

  const messageList = useRef<MessageListHandle>(null);
  const jumpTo = useJumpToMessage(chat, messageList, () => toast.show(t('message-too-old')));
  // Pinned messages: owners and admins pin in a room, both people in a DM
  const pins = usePins(name);
  const pinnedIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);
  const canPin = !isGuest && (isDm || chat.room.myLevel >= 1);
  const togglePin = (msg: Message) =>
    getSocket().emit(pinnedIds.has(msg.id) ? 'unpin_message' : 'pin_message', { id: msg.id });
  useEffect(() => {
    const socket = getSocket();
    const onResult = (reply: { success: boolean; code?: string }) => { if (!reply.success) toast.show(t.server(reply, 'pin-failed')); };
    socket.on('pin_result', onResult);
    return () => { socket.off('pin_result', onResult); };
  }, [toast, t]);

  // Opened with more unread than fit on a screen: start at the first of them
  const startedAtUnread = useRef(false);
  useEffect(() => {
    if (!chat.unreadAtOpen || startedAtUnread.current) return;
    startedAtUnread.current = true;
    if (chat.unreadAtOpen.count > UNREAD_JUMP) jumpTo(chat.unreadAtOpen.id);
  }, [chat.unreadAtOpen, jumpTo]);

  const photos = usePhotoSending({
    enabled: !isGuest,
    send: (image) => { chat.send('', replyingTo, { id: image.id, w: image.width, h: image.height }); setReplyingTo(null); },
    onError: (error) => toast.show(t(error === 'rate_limited' ? 'image_rate_limited' : error)),
  });

  // Reactions: recent emoji first, remembered across chats
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { loadRecentEmojis().then(setRecent); }, []);
  function react(messageId: number, emoji: string) {
    chat.react(messageId, emoji);
    recordRecentEmoji(emoji).then(setRecent);
  }
  const quick = buildReactionQuickList(recent);
  const panelRef = useRef<View>(null);
  const [panel, setPanel] = useState<PanelBox>({ x: 0, y: 0, w: 0 });
  const reactions = useReactionPopovers({ panel, sheet: !isDesktop, quick, recent, react });

  function send() {
    chat.send(input, replyingTo);
    setInput('');
    if (input.trim()) setReplyingTo(null);
  }

  function reply(msg: Message) {
    setEditing(null);
    setReplyingTo(msg);
  }

  function joinVoiceHere() {
    if (inVoiceElsewhere && p.onLeaveAndSwitch) {
      showAlert(t('switch-voice-title'), t('switch-voice-msg', { from: t.room(p.activeVoiceRoom!), to: t.room(name) }), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('switch'), onPress: () => p.onLeaveAndSwitch!(name) },
      ]);
    } else {
      voice.joinVoice();
    }
  }

  function openRoom(room: string) {
    if (p.onNavigateToRoom) p.onNavigateToRoom(room);
    else router.push({ pathname: '/(main)/room/[name]', params: { name: room } });
  }

  const blocked = new Set(usePeopleStore((s) => s.blocked));
  const shown = chat.messages.filter((m) => m.system || !blocked.has(m.username));
  const sheetMsg = sheetFor?.msg;
  const canModerate = chat.room.myLevel >= 1;

  return (
    <View
      ref={panelRef}
      style={[s.container, { backgroundColor: c.bg }]}
      onLayout={() => panelRef.current?.measure((_x, _y, w, _h, pageX, pageY) => setPanel({ x: pageX, y: pageY, w }))}
    >
      <ChatHeader
        name={name}
        dmMeta={p.dmMeta}
        memberCount={chat.room.memberCount}
        code={chat.room.code}
        showBackBtn={!!p.showBackBtn}
        onBack={back}
        onOpenInfo={() => setShowCard(true)}
        onOpenMembers={() => setShowMembers(true)}
        voicePillMembers={voice.inVoice ? voice.voiceMembers : chat.voiceMembers}
        onVoicePillPress={inVoiceElsewhere ? () => p.onNavigateToRoom?.(p.activeVoiceRoom!) : () => setShowMembers(true)}
        showMembersButton={!isDesktop}
        onTitlePress={() => (p.dmMeta
          ? showPerson({
            username: p.dmMeta.username, screenname: p.dmMeta.screenname,
            avatar_expression: p.dmMeta.avatarExpression, avatar_color: p.dmMeta.avatarColor,
          }, name)
          : setShowCard(true))}
      />
      <PinnedBar pins={pins} onJumpTo={jumpTo} />

      <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MessageList
          ref={messageList}
          room={name}
          messages={shown}
          currentUsername={me?.username}
          isDesktop={isDesktop}
          readOnly={isGuest}
          canModerate={canModerate}
          hasOlder={chat.hasOlder}
          loadingOlder={chat.loadingOlder}
          onLoadOlder={chat.loadOlder}
          onReact={react}
          onLongPress={(msg) => { if (!msg.recalled) setSheetFor({ msg, at: Date.now() }); }}
          onReactionButton={(msg, pageX, pageY, height) => {
            reactions.openBar(msg.id, { pageX, pageY, height });
            setShowInputEmoji(false);
          }}
          onEdit={(msg) => setEditing({ id: msg.id, text: msg.text })}
          onRecall={(msg) => chat.recall(msg.id)}
          onOpenRoom={openRoom}
          onReply={reply}
          onRetry={chat.resend}
          typing={chat.typing}
          unreadFrom={chat.unreadAtOpen?.id}
          pinnedIds={pinnedIds}
          onTogglePin={canPin ? togglePin : undefined}
        />
        <Composer
          input={input}
          onChangeInput={(text) => { setInput(text); if (text.trim()) chat.notifyTyping(); }}
          onSend={send}
          emojiOpen={showInputEmoji}
          onToggleEmoji={() => { setShowInputEmoji((v) => !v); reactions.closeBar(); }}
          editText={editing?.text ?? null}
          onChangeEdit={(text) => setEditing((e) => (e ? { ...e, text } : e))}
          onSaveEdit={() => { if (editing) chat.edit(editing.id, editing.text); setEditing(null); }}
          onCancelEdit={() => setEditing(null)}
          isMuted={chat.isTextMuted}
          isGuest={isGuest}
          replyingTo={replyingTo ? { name: replyingTo.isOwn ? t('you') : replyingTo.screenname, text: replyingTo.text } : null}
          onCancelReply={() => setReplyingTo(null)}
          onAttach={photos.attach}
          uploading={photos.uploading}
          mentionable={name.startsWith('dm:') ? undefined : members}
          me={me?.username}
          canMentionEveryone={canModerate && name !== LOBBY_ID}
        />
      </KeyboardAvoidingView>

      {/* Emoji for the message box (remembered like reactions) */}
      <EmojiPicker
        visible={showInputEmoji}
        sheet={!isDesktop}
        position={{ bottom: 76, left: 12 }}
        recent={recent}
        onClose={() => setShowInputEmoji(false)}
        onSelect={(emoji) => {
          setInput((prev) => prev + emoji);
          recordRecentEmoji(emoji).then(setRecent);
          setShowInputEmoji(false);
        }}
      />

      {reactions.element}

      {/* Phones: long-press a message */}
      <MessageActionsSheet
        message={isDesktop ? null : sheetMsg ?? null}
        openedAt={sheetFor?.at ?? 0}
        quickEmojis={quick}
        canEdit={!!sheetMsg?.isOwn}
        canRecall={!!sheetMsg && (sheetMsg.isOwn || canModerate)}
        onClose={() => setSheetFor(null)}
        onReact={(emoji) => { if (sheetMsg) react(sheetMsg.id, emoji); setSheetFor(null); }}
        onMoreEmojis={() => { if (sheetMsg) reactions.openPicker(sheetMsg.id); setSheetFor(null); }}
        onEdit={() => { if (sheetMsg) setEditing({ id: sheetMsg.id, text: sheetMsg.text }); setSheetFor(null); }}
        onRecall={() => { if (sheetMsg) chat.recall(sheetMsg.id); setSheetFor(null); }}
        onReply={() => { if (sheetMsg) reply(sheetMsg); setSheetFor(null); }}
        onPin={sheetMsg && canPin && !sheetMsg.pending ? () => { togglePin(sheetMsg); setSheetFor(null); } : undefined}
        pinned={!!sheetMsg && pinnedIds.has(sheetMsg.id)}
        onReport={sheetMsg && !sheetMsg.isOwn && !sheetMsg.system
          ? () => { confirmReportMessage(sheetMsg); setSheetFor(null); } : undefined}
      />

      <ChatCard
        visible={showCard}
        name={name}
        dmMeta={p.dmMeta}
        room={chat.room}
        isGuest={isGuest}
        onJumpTo={jumpTo}
        onClose={() => setShowCard(false)}
        onLeave={() => { setShowCard(false); chat.leave(); back(); }}
        onCloseRoom={() => { setShowCard(false); chat.close(); }}
        onCopied={() => toast.show(t('copied'))}
      />

      {showMembers && (
        <RightDrawer onClose={() => setShowMembers(false)} c={c}>
          <MembersPanel
            room={name}
            voice={isGuest ? undefined : voice}
            roomVoiceMembers={chat.voiceMembers}
            currentUsername={me?.username}
            isVoiceHere={inVoiceHere}
            onJoinVoice={joinVoiceHere}
            style={{ width: '100%', borderLeftWidth: 0 }}
          />
        </RightDrawer>
      )}

      {/* Phones: cards opened in this chat (the desktop shell has its own) */}
      {!isDesktop && (
        <ProfileCardHost
          voiceRoom={inVoiceHere ? name : null}
          onOpenDm={(person) => router.push({
            pathname: '/(main)/room/[name]',
            params: {
              name: `dm:${[me?.username ?? '', person.username].sort().join(':')}`,
              otherUsername: person.username, displayName: person.screenname,
              avatarExpression: person.avatar_expression ?? '', avatarColor: person.avatar_color ?? '',
            },
          })}
          onOpenRoom={openRoom}
        />
      )}

      {toast.element}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1 },
});

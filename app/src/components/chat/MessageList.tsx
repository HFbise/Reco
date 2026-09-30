import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { MessageBubble, type Message } from '../MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { buildFeed, type FeedItem } from '../../lib/feed';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { Spacing } from '../../theme';
import { isTouchScreen } from '../../lib/pointer';

const QUICK_REACTION = '👍';

interface Props {
  messages: Message[];
  currentUsername?: string;
  isDesktop: boolean;
  /** Read-only viewers (demo guests) get no message actions */
  readOnly: boolean;
  /** Can recall other people's messages (room owner/admin) */
  canModerate: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onReact: (msgId: number, emoji: string) => void;
  onLongPress: (msg: Message) => void;
  onReactionButton: (msg: Message, pageX: number, pageY: number, btnH: number) => void;
  onEdit: (msg: Message) => void;
  onRecall: (msg: Message) => void;
  onOpenRoom: (room: string) => void;
  onReply: (msg: Message) => void;
  /** Display names of the others typing right now */
  typing: string[];
}

const HIGHLIGHT_MS = 1600;

export interface MessageListHandle {
  /** Scroll to a loaded message and flash it; false if it isn't loaded */
  jumpTo: (id: number) => boolean;
}

export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList(p, ref) {
  const c = useColors();
  const t = useT();
  // Inverted list: newest at the bottom, so feed it newest-first
  const data = useMemo(() => [...buildFeed(p.messages, t.monthDay)].reverse(), [p.messages, t.monthDay]);
  const list = useRef<FlatList<FeedItem>>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  useEffect(() => {
    if (highlighted == null) return;
    const timer = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  /** A quote (or a search result) was tapped: bring the message into view and flash it, if it's loaded */
  function jumpTo(id: number) {
    const index = data.findIndex((item) => item._type !== 'sep' && (item as Message).id === id);
    if (index === -1) return false;
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setHighlighted(id);
    return true;
  }
  useImperativeHandle(ref, () => ({ jumpTo }));

  function renderItem({ item }: { item: FeedItem }) {
    if (item._type === 'sep') {
      return (
        <View style={s.timeSep}>
          <Text style={[s.timeSepText, { color: c.textSub, backgroundColor: c.surface2 }]}>{item.time}</Text>
        </View>
      );
    }
    const msg = item as Message & { _cont?: boolean };
    if (msg.system) {
      return <Text style={[s.sysMsg, { color: c.textSub }]}>{t.system(msg)}</Text>;
    }
    const invite = msg.meta?.invite;
    if (invite) {
      return (
        <View style={[s.inviteCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[s.inviteTitle, { color: c.text }]}>
            {msg.isOwn
              ? t('invite-sent-text', { room: t.room(invite.room) })
              : t('invite-text', { name: msg.screenname, room: t.room(invite.room) })}
          </Text>
          <TouchableOpacity style={[s.inviteBtn, { backgroundColor: c.accent }]} onPress={() => p.onOpenRoom(invite.room)} activeOpacity={0.85}>
            <Text style={s.inviteBtnText}>{t.room(invite.room)}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const desktopActions = p.isDesktop && !p.readOnly;
    return (
      <MessageBubble
        msg={msg}
        cont={msg._cont}
        currentUsername={p.currentUsername}
        isDesktop={p.isDesktop}
        onReactionPress={p.readOnly ? undefined : (emoji) => p.onReact(msg.id, emoji)}
        onLongPress={p.isDesktop || p.readOnly ? undefined : () => p.onLongPress(msg)}
        onReactionBtnPress={desktopActions ? (x, y, h) => p.onReactionButton(msg, x, y, h) : undefined}
        onEdit={desktopActions && msg.isOwn ? () => p.onEdit(msg) : undefined}
        onRecall={desktopActions && (msg.isOwn || p.canModerate) ? () => p.onRecall(msg) : undefined}
        // Touch screens: double tap for a quick 👍. Only adds: a double tap never takes a reaction back
        onDoubleTap={isTouchScreen && !p.readOnly && !msg.recalled ? () => {
          if (!msg.reactions?.[QUICK_REACTION]?.includes(p.currentUsername ?? '')) p.onReact(msg.id, QUICK_REACTION);
        } : undefined}
        onReply={desktopActions ? () => p.onReply(msg) : undefined}
        onQuotePress={jumpTo}
        highlighted={highlighted === msg.id}
      />
    );
  }

  return (
    <FlatList
      ref={list}
      data={data}
      inverted
      // Everything loaded is rendered (initialNumToRender), so this only covers odd layouts
      onScrollToIndexFailed={({ index }) => setTimeout(() => list.current?.scrollToIndex({ index, viewPosition: 0.5 }), 100)}
      // In an inverted list the "end" is the top of the chat
      onEndReached={p.onLoadOlder}
      onEndReachedThreshold={0.2}
      ListFooterComponent={p.hasOlder ? (
        <TouchableOpacity style={s.loadOlderBtn} onPress={p.onLoadOlder} disabled={p.loadingOlder} activeOpacity={0.7}>
          {p.loadingOlder
            ? <ActivityIndicator size="small" color={c.textMuted} />
            : <Text style={[s.loadOlderText, { color: c.accent }]}>{t('load-older')}</Text>}
        </TouchableOpacity>
      ) : null}
      initialNumToRender={data.length || 20}
      keyExtractor={(item) => (item._type === 'sep' ? item._id : String((item as Message).id))}
      renderItem={renderItem}
      // Inverted: the "header" sits under the newest message
      ListHeaderComponent={p.typing.length ? <TypingIndicator label={
        p.typing.length === 1 ? t('typing-one', { name: p.typing[0] })
          : p.typing.length === 2 ? t('typing-two', { a: p.typing[0], b: p.typing[1] })
          : t('typing-many')
      } /> : null}
      contentContainerStyle={s.list}
    />
  );
});

const s = StyleSheet.create({
  list: { paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  timeSep: { alignItems: 'center', marginTop: 18, marginBottom: 4 },
  timeSepText: { fontSize: 12, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  sysMsg: { textAlign: 'center', fontSize: 13, paddingTop: 10, paddingHorizontal: Spacing.lg },
  loadOlderBtn: { alignItems: 'center', paddingVertical: 12 },
  loadOlderText: { fontSize: 13, fontWeight: '600' as any },
  inviteCard: { margin: 12, borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  inviteTitle: { fontSize: 13 },
  inviteBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  inviteBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' as any },
});

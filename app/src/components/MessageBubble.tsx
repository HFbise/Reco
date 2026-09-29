import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated, Easing, Image } from 'react-native';
import { ImageViewer } from './chat/ImageViewer';
import { fitImage, imageUrl } from '../lib/images';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconEmoji, IconPencil, IconReply, IconTrash } from './Icon';
import { Fonts, Spacing } from '../theme';
import { getAvatarColor, nameColor } from '../lib/avatar';
export { getAvatarColor } from '../lib/avatar';

export interface Message {
  id: number;
  username: string;
  screenname: string;
  text: string;
  time: string;
  recalled?: boolean;
  edited?: boolean;
  reactions?: Record<string, string[]>;
  isOwn: boolean;
  system?: boolean;
  meta?: { invite?: { room: string; code: string }; image?: { id: string; w: number; h: number } } | null;
  avatar_expression?: string;
  avatar_color?: string;
  /** The message this one replies to, as quoted by the server */
  reply?: { id: number; username: string; screenname: string; text: string; recalled: boolean } | null;
}

interface Props {
  msg: Message;
  currentUsername?: string;
  /** Same sender as the message just above: skip the name and avatar */
  cont?: boolean;
  onLongPress?: () => void;
  onReactionPress?: (emoji: string) => void;
  isDesktop?: boolean;
  onEdit?: () => void;
  onRecall?: () => void;
  // Desktop: called when the react button is pressed, provides button's page position for popup placement
  onReactionBtnPress?: (pageX: number, pageY: number, btnH: number) => void;
  /** Touch screens: a double tap on the bubble (a quick 👍) */
  onDoubleTap?: () => void;
  /** Start a reply to this message (desktop: a hover button; phones use the long-press sheet) */
  onReply?: () => void;
  /** The quote was tapped: jump to the message it quotes */
  onQuotePress?: (id: number) => void;
  /** Briefly highlighted after a jump to it */
  highlighted?: boolean;
}

const DOUBLE_TAP_MS = 300;

const AVATAR = 36;

export function MessageBubble({
  msg, currentUsername, cont, onLongPress, onReactionPress, isDesktop, onEdit, onRecall, onReactionBtnPress, onDoubleTap,
  onReply, onQuotePress, highlighted,
}: Props) {
  const c = useColors();
  const t = useT();
  const { isOwn } = msg;
  const hasReactions = msg.reactions && Object.values(msg.reactions).some(u => u.length > 0);
  const [hovered, setHovered] = useState(false);
  const reactBtnRef = useRef<any>(null);
  const lastTap = useRef(0);
  const [viewing, setViewing] = useState(false);
  const pop = useRef(new Animated.Value(0)).current;
  const [popped, setPopped] = useState('👍');
  const lastPop = useRef({ emoji: '', at: 0 });
  // Reactions already there when the message first rendered (history) don't animate
  const live = useRef(false);
  useEffect(() => { live.current = true; }, []);

  /** The emoji pops over the bubble and floats off: your reaction landed */
  function popEmoji(emoji: string) {
    const now = Date.now();
    if (lastPop.current.emoji === emoji && now - lastPop.current.at < 1200) return; // the server echo of a tap we already showed
    lastPop.current = { emoji, at: now };
    setPopped(emoji);
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }

  // Any emoji you add, from any menu, pops the same way
  const mine = Object.entries(msg.reactions ?? {})
    .filter(([, users]) => users.includes(currentUsername ?? '')).map(([e]) => e).join('|');
  const prevMine = useRef(mine);
  useEffect(() => {
    const before = new Set(prevMine.current.split('|'));
    prevMine.current = mine;
    if (!live.current) return;
    const added = mine.split('|').find((e) => e && !before.has(e));
    if (added) popEmoji(added);
  }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Double tap, read from the raw touches rather than two presses: browsers turn quick
  // tap pairs into clicks (or not) in their own ways, which made press-based detection flaky.
  // A tap = a short touch that barely moves (so scrolling and long-presses don't count).
  const touchStart = useRef({ x: 0, y: 0, at: 0 });
  function onTouchStart(e: any) {
    const tch = e.nativeEvent.touches?.[0] ?? e.nativeEvent;
    touchStart.current = { x: tch.pageX, y: tch.pageY, at: Date.now() };
  }
  function onTouchEnd(e: any) {
    const tch = e.nativeEvent.changedTouches?.[0] ?? e.nativeEvent;
    const start = touchStart.current;
    const now = Date.now();
    const isTap = now - start.at < 250 && Math.hypot(tch.pageX - start.x, tch.pageY - start.y) < 10;
    if (!isTap) { lastTap.current = 0; return; }
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      onDoubleTap?.();
      popEmoji('👍'); // right away, without waiting for the server
      return;
    }
    lastTap.current = now;
  }

  const hoverHandlers = isDesktop && Platform.OS === 'web' ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};

  const showHoverActions = isDesktop && !msg.recalled && hovered;
  const avatarColor = msg.avatar_color || getAvatarColor(msg.username);

  function handleReactBtnPress() {
    const ref = reactBtnRef.current;
    if (ref?.measure) {
      ref.measure((_x: number, _y: number, _w: number, h: number, pageX: number, pageY: number) => {
        onReactionBtnPress?.(pageX, pageY, h);
      });
    } else {
      onReactionBtnPress?.(0, 0, 0);
    }
  }

  // The message this one answers: a tinted strip with who said it and how it started
  const reply = msg.reply;
  const quoteName = reply
    ? (reply.username === currentUsername ? t('you') : reply.screenname)
    : '';
  const quoteColor = reply ? nameColor(getAvatarColor(reply.username), c.isDark, isOwn ? c.bubbleOwn : c.bubbleOther) : '';
  const quote = reply && !msg.recalled ? (
    <TouchableOpacity
      onPress={() => onQuotePress?.(reply.id)}
      activeOpacity={0.7}
      disabled={!onQuotePress}
      accessibilityRole="button"
      accessibilityLabel={`${t('reply-to', { name: quoteName })}: ${reply.recalled ? t('msg-recalled') : reply.text}`}
      style={[s.quote, {
        backgroundColor: isOwn ? 'rgba(255,255,255,0.14)' : c.surface2,
        borderLeftColor: isOwn ? c.onAccent : quoteColor,
      }]}
    >
      <Text style={[s.quoteName, { color: isOwn ? c.onAccent : quoteColor }]} numberOfLines={1}>{quoteName}</Text>
      <Text style={[s.quoteText, { color: isOwn ? 'rgba(255,255,255,0.85)' : c.textSub }, reply.recalled && s.quoteRecalled]}
        numberOfLines={2}>
        {reply.recalled ? t('msg-recalled') : reply.text}
      </Text>
    </TouchableOpacity>
  ) : null;

  const image = !msg.recalled ? msg.meta?.image : undefined;
  const photo = image ? (
    <TouchableOpacity onPress={() => setViewing(true)} activeOpacity={0.9} accessibilityRole="imagebutton"
      accessibilityLabel={t('photo')}>
      <Image source={{ uri: imageUrl(image.id) }} style={[s.photo, fitImage(image.w, image.h), { backgroundColor: c.surface2 }]}
        resizeMode="cover" />
    </TouchableOpacity>
  ) : null;

  const bubbleContent = msg.recalled ? (
    <Text style={[s.recalled, { color: isOwn ? 'rgba(255,255,255,0.7)' : c.textMuted }]}>{t('msg-recalled')}</Text>
  ) : (
    <>
      {quote}
      {photo}
      {!!msg.text && <Text style={[s.text, { color: isOwn ? c.onAccent : c.text }, !!photo && s.caption]}>{msg.text}</Text>}
      {msg.edited && <Text style={[s.editedLabel, { color: isOwn ? 'rgba(255,255,255,0.7)' : c.textMuted }]}>{t('msg-edited')}</Text>}
    </>
  );

  // Desktop hover actions: [react] [edit?] [recall?]
  // Clicking react measures its position and hands off to ChatPanel for the popup
  const hoverActions = showHoverActions ? (
    <View style={[s.hoverActions, { backgroundColor: c.surface, borderColor: c.border }]}>
      {onReply && (
        <TouchableOpacity style={s.hoverBtn} onPress={onReply} activeOpacity={0.7} accessibilityLabel={t('reply')}>
          <IconReply size={17} color={c.textSub} />
        </TouchableOpacity>
      )}
      <TouchableOpacity ref={reactBtnRef} style={s.hoverBtn} onPress={handleReactBtnPress} activeOpacity={0.7}
        accessibilityLabel={t('emoji')}>
        <IconEmoji size={17} color={c.textSub} />
      </TouchableOpacity>
      {onEdit && (
        <TouchableOpacity style={s.hoverBtn} onPress={onEdit} activeOpacity={0.7} accessibilityLabel={t('edit')}>
          <IconPencil size={16} color={c.textSub} />
        </TouchableOpacity>
      )}
      {onRecall && (
        <TouchableOpacity style={s.hoverBtn} onPress={onRecall} activeOpacity={0.7} accessibilityLabel={t('recall')}>
          <IconTrash size={16} color={c.danger} />
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  return (
    <View
      style={[s.row, isOwn && s.rowOwn, { paddingHorizontal: isDesktop ? Spacing.xxl + 4 : Spacing.lg, marginTop: cont ? 2 : 10 }]}
      {...hoverHandlers as any}
    >
      {/* Your own messages need no avatar; a continuation keeps the others' column */}
      {!isOwn && (cont
        ? <View style={{ width: AVATAR }} />
        : <AvatarView expression={msg.avatar_expression} color={avatarColor} username={msg.username} screenname={msg.screenname} size={AVATAR} />)}

      <View style={[s.body, isOwn ? s.bodyOwn : s.bodyOther]}>
        {!isOwn && !cont && (
          <Text style={[s.name, { color: nameColor(avatarColor, c.isDark, c.bg) }]}>{msg.screenname}</Text>
        )}

        <View style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}>
          {/* Touchable only when there's something to do with the bubble itself (phones).
              A disabled button around it would make the quote inside count as disabled too. */}
          <BubbleWrap
            interactive={!!(onLongPress || onDoubleTap)}
            onLongPress={onLongPress}
            {...(onDoubleTap ? { onTouchStart, onTouchEnd } : null)}
          >
            <View style={[
              s.bubble,
              isOwn ? s.tailOwn : s.tailOther,
              { backgroundColor: isOwn ? c.bubbleOwn : c.bubbleOther },
              !isOwn && !c.isDark && s.lifted,
              highlighted && { borderWidth: 2, borderColor: c.sunny },
              image && !msg.text && !reply && s.photoBubble,
            ]}>
              {bubbleContent}
            </View>
            <Animated.Text pointerEvents="none" style={[s.pop, {
              opacity: pop.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { scale: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.25, 1] }) },
                { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) },
              ],
            }]}>{popped}</Animated.Text>
          </BubbleWrap>
          {hoverActions}
          {viewing && image && <ImageViewer image={image} onClose={() => setViewing(false)} />}
        </View>

        {hasReactions && (
          <View style={[s.reactionsRow, isOwn && s.reactionsRowOwn]}>
            {Object.entries(msg.reactions!).map(([emoji, users]) => {
              if (!users.length) return null;
              return (
                <ReactionPill
                  key={emoji}
                  emoji={emoji}
                  count={users.length}
                  mine={users.includes(currentUsername ?? '')}
                  animate={live.current}
                  onPress={() => onReactionPress?.(emoji)}
                />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

/** The bubble's frame: a long-pressable touchable on phones, a plain box otherwise. */
function BubbleWrap({ interactive, children, ...touch }: {
  interactive: boolean; children: ReactNode; onLongPress?: () => void; onTouchStart?: (e: any) => void; onTouchEnd?: (e: any) => void;
}) {
  if (!interactive) return <View style={s.bubbleTouch}>{children}</View>;
  return (
    <TouchableOpacity {...touch} delayLongPress={350} activeOpacity={0.85} style={s.bubbleTouch}>
      {children}
    </TouchableOpacity>
  );
}

/** A reaction count under a bubble. New ones pop in, and a count going up gives a little bounce. */
function ReactionPill({ emoji, count, mine, animate, onPress }: {
  emoji: string; count: number; mine: boolean; animate: boolean; onPress: () => void;
}) {
  const c = useColors();
  const scale = useRef(new Animated.Value(animate ? 0.4 : 1)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (animate) Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (count > prevCount.current) {
      scale.setValue(1.3);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
    prevCount.current = count;
  }, [count, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          s.reactionPill,
          mine ? { backgroundColor: c.accentBg, borderColor: c.accent } : { backgroundColor: c.surface2, borderColor: 'transparent' },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={`${emoji} ${count}`}
        accessibilityState={{ selected: mine }}
      >
        <Text style={s.reactionEmoji}>{emoji}</Text>
        <Text style={[s.reactionCount, { color: mine ? c.accentText : c.textSub }]}>{count}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  rowOwn: { flexDirection: 'row-reverse' },

  body: { gap: 4, minWidth: 0 },
  bodyOther: { flex: 1 },
  bodyOwn: { flexShrink: 1, alignItems: 'flex-end', maxWidth: '72%' },

  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bubbleRowOwn: { flexDirection: 'row-reverse' },

  name: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },

  // Without shrink the bubble grows to the text's full length instead of wrapping
  bubbleTouch: { flexShrink: 1, minWidth: 0, maxWidth: '85%', position: 'relative' },
  pop: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -18, fontSize: 30, lineHeight: 36 },
  bubble: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, maxWidth: '100%' },
  photoBubble: { padding: 4 },
  photo: { borderRadius: 16 },
  caption: { marginTop: 8 },
  // The corner nearest the sender stays tight, like a speech bubble's tail
  tailOther: { borderBottomLeftRadius: 6 },
  tailOwn: { borderBottomRightRadius: 6 },
  lifted: {
    shadowColor: '#161A23', shadowOpacity: 0.07, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },

  // web: long URLs / unbroken strings wrap instead of widening the bubble
  text: { fontSize: 15, lineHeight: 22, ...(Platform.OS === 'web' ? { wordBreak: 'break-word' } : {}) } as any,
  editedLabel: { fontSize: 11, marginTop: 2 },
  recalled: { fontSize: 14, fontStyle: 'italic' },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, marginBottom: 6, gap: 1 },
  quoteName: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  quoteText: { fontSize: 13, lineHeight: 17 },
  quoteRecalled: { fontStyle: 'italic' },

  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 28, borderRadius: 14, paddingHorizontal: 10, borderWidth: 1.5,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },

  hoverActions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0, padding: 2, borderRadius: 10, borderWidth: 1 },
  hoverBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

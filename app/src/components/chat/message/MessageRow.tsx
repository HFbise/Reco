import { useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AvatarView } from '../../AvatarView';
import { getAvatarColor, nameColor } from '../../../lib/avatar';
import { useColors } from '../../../hooks/useColors';
import { Fonts, Spacing } from '../../../theme';
import { BubbleBody, photoOnly } from './BubbleBody';
import { HoverActions, type HoverHandlers } from './HoverActions';
import { Reactions } from './Reactions';
import { useDoubleTap } from './useDoubleTap';
import { useReactionPop } from './useReactionPop';
import type { Message } from './types';

const AVATAR = 36;
const QUICK_REACTION = '👍';

interface Props extends HoverHandlers {
  msg: Message;
  /** The signed-in username */
  me?: string;
  /** Same sender as the message just above: no name, no avatar */
  cont?: boolean;
  /** Wide layout (more side padding; hover actions with a mouse) */
  wide?: boolean;
  /** Phones: the long-press sheet */
  onLongPress?: () => void;
  /** Touch screens: a double tap adds 👍 */
  onDoubleTap?: () => void;
  /** A reaction pill was tapped */
  onReactionPress?: (emoji: string) => void;
  /** The quote was tapped: show the message it quotes */
  onQuotePress?: (id: number) => void;
  /** Briefly outlined after a jump to it */
  highlighted?: boolean;
}

/**
 * One message: avatar and name (others'), the bubble, reactions under it, and on desktop the
 * hover actions beside it.
 *
 * Width: the column beside the avatar is capped at a share of the row, which has a known width.
 * The bubble inside sizes to its text up to that cap. (A cap that is a percentage of something
 * sized by its own text is circular: browsers settle it narrower than the text, so Chinese,
 * which may break between any two characters, wrapped early, down to one character a line.)
 */
export function MessageRow(p: Props) {
  const c = useColors();
  const { msg } = p;
  const own = msg.isOwn;
  const [hovered, setHovered] = useState(false);

  const myReactions = Object.entries(msg.reactions ?? {}).filter(([, users]) => users.includes(p.me ?? '')).map(([e]) => e);
  const pop = useReactionPop(myReactions);
  const doubleTap = useDoubleTap(p.onDoubleTap && (() => { p.onDoubleTap!(); pop.pop(QUICK_REACTION); }));

  const avatarColor = msg.avatar_color || getAvatarColor(msg.username);
  const hoverable = p.wide && Platform.OS === 'web' && !msg.recalled;
  const hasHoverActions = !!(p.onReply || p.onReact || p.onEdit || p.onRecall);

  const bubble = (
    <View style={[
      s.bubble,
      own ? s.tailOwn : s.tailOther,
      { backgroundColor: own ? c.bubbleOwn : c.bubbleOther },
      !own && !c.isDark && s.lifted,
      p.highlighted && { borderWidth: 2, borderColor: c.sunny },
      photoOnly(msg) && s.photoFrame,
    ]}>
      <BubbleBody msg={msg} me={p.me} onQuotePress={p.onQuotePress} />
    </View>
  );

  return (
    <View
      style={[s.row, own && s.rowOwn, { paddingHorizontal: p.wide ? Spacing.xxl + 4 : Spacing.lg, marginTop: p.cont ? 2 : 10 }]}
      {...(hoverable ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } : {}) as any}
    >
      {!own && (p.cont
        ? <View style={s.avatarSpace} />
        : <AvatarView expression={msg.avatar_expression} color={avatarColor} username={msg.username} screenname={msg.screenname} size={AVATAR} />)}

      <View style={[s.column, own ? s.columnOwn : s.columnOther]}>
        {!own && !p.cont && (
          <Text style={[s.name, { color: nameColor(avatarColor, c.isDark, c.bg) }]}>{msg.screenname}</Text>
        )}
        <View style={s.bubbleLine}>
          {/* Touchable only when there's something to do with the bubble itself (phones):
              a disabled button around it would make the quote inside count as disabled too */}
          {p.onLongPress || doubleTap ? (
            <TouchableOpacity onLongPress={p.onLongPress} delayLongPress={350} activeOpacity={0.85} {...doubleTap}>
              {bubble}
            </TouchableOpacity>
          ) : bubble}
          <Animated.Text pointerEvents="none" style={[s.pop, pop.style]}>{pop.emoji}</Animated.Text>
          {hovered && hasHoverActions && (
            <HoverActions own={own} onReply={p.onReply} onReact={p.onReact} onEdit={p.onEdit} onRecall={p.onRecall} />
          )}
        </View>
        <Reactions reactions={msg.reactions ?? {}} me={p.me} own={own} animate={pop.live.current} onPress={p.onReactionPress} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  rowOwn: { justifyContent: 'flex-end' },
  avatarSpace: { width: AVATAR },
  column: { gap: 4, flexShrink: 1, minWidth: 0 },
  columnOther: { maxWidth: '78%', alignItems: 'flex-start' },
  columnOwn: { maxWidth: '72%', alignItems: 'flex-end' },
  name: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  // Positions the pop and the hover actions; sized by the bubble alone
  bubbleLine: { position: 'relative' },
  bubble: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10 },
  photoFrame: { padding: 4 },
  // The corner nearest the sender stays tight, like a speech bubble's tail
  tailOther: { borderBottomLeftRadius: 6 },
  tailOwn: { borderBottomRightRadius: 6 },
  lifted: { shadowColor: '#161A23', shadowOpacity: 0.07, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  pop: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -18, fontSize: 30, lineHeight: 36 },
});

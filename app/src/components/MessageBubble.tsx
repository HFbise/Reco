import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconEmoji, IconPencil, IconTrash } from './Icon';
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
  meta?: { invite?: { room: string; code: string } } | null;
  avatar_expression?: string;
  avatar_color?: string;
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
}

const AVATAR = 36;

export function MessageBubble({ msg, currentUsername, cont, onLongPress, onReactionPress, isDesktop, onEdit, onRecall, onReactionBtnPress }: Props) {
  const c = useColors();
  const t = useT();
  const { isOwn } = msg;
  const hasReactions = msg.reactions && Object.values(msg.reactions).some(u => u.length > 0);
  const [hovered, setHovered] = useState(false);
  const reactBtnRef = useRef<any>(null);

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

  const bubbleContent = msg.recalled ? (
    <Text style={[s.recalled, { color: isOwn ? 'rgba(255,255,255,0.7)' : c.textMuted }]}>{t('msg-recalled')}</Text>
  ) : (
    <>
      <Text style={[s.text, { color: isOwn ? c.onAccent : c.text }]}>{msg.text}</Text>
      {msg.edited && <Text style={[s.editedLabel, { color: isOwn ? 'rgba(255,255,255,0.7)' : c.textMuted }]}>{t('msg-edited')}</Text>}
    </>
  );

  // Desktop hover actions: [react] [edit?] [recall?]
  // Clicking react measures its position and hands off to ChatPanel for the popup
  const hoverActions = showHoverActions ? (
    <View style={[s.hoverActions, { backgroundColor: c.surface, borderColor: c.border }]}>
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
          <TouchableOpacity
            onLongPress={onLongPress}
            delayLongPress={350}
            activeOpacity={0.85}
            disabled={!onLongPress}
            style={s.bubbleTouch}
          >
            <View style={[
              s.bubble,
              isOwn ? s.tailOwn : s.tailOther,
              { backgroundColor: isOwn ? c.bubbleOwn : c.bubbleOther },
              !isOwn && !c.isDark && s.lifted,
            ]}>
              {bubbleContent}
            </View>
          </TouchableOpacity>
          {hoverActions}
        </View>

        {hasReactions && (
          <View style={[s.reactionsRow, isOwn && s.reactionsRowOwn]}>
            {Object.entries(msg.reactions!).map(([emoji, users]) => {
              if (!users.length) return null;
              const mine = users.includes(currentUsername ?? '');
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    s.reactionPill,
                    mine
                      ? { backgroundColor: c.accentBg, borderColor: c.accent }
                      : { backgroundColor: c.surface2, borderColor: 'transparent' },
                  ]}
                  onPress={() => onReactionPress?.(emoji)}
                  activeOpacity={0.7}
                  accessibilityLabel={`${emoji} ${users.length}`}
                  accessibilityState={{ selected: mine }}
                >
                  <Text style={s.reactionEmoji}>{emoji}</Text>
                  <Text style={[s.reactionCount, { color: mine ? c.accentText : c.textSub }]}>{users.length}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
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
  bubbleTouch: { flexShrink: 1, minWidth: 0, maxWidth: '85%' },
  bubble: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, maxWidth: '100%' },
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

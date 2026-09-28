import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconEmoji } from './Icon';
import { Fonts, Radius, Spacing } from '../theme';
import { getAvatarColor } from '../lib/avatar';
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
  onLongPress?: () => void;
  onReactionPress?: (emoji: string) => void;
  isDesktop?: boolean;
  onEdit?: () => void;
  onRecall?: () => void;
  // Desktop: called when the react button is pressed, provides button's page position for popup placement
  onReactionBtnPress?: (pageX: number, pageY: number, btnH: number) => void;
}



export function MessageBubble({ msg, currentUsername, onLongPress, onReactionPress, isDesktop, onEdit, onRecall, onReactionBtnPress }: Props) {
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
    <Text style={[s.recalled, { color: isOwn ? 'rgba(255,255,255,0.65)' : c.textMuted }]}>{t('msg-recalled')}</Text>
  ) : (
    <>
      <Text style={[s.text, { color: isOwn ? c.onAccent : c.text }]}>{msg.text}</Text>
      {msg.edited && <Text style={[s.editedLabel, { color: isOwn ? 'rgba(255,255,255,0.55)' : 'rgba(150,150,150,0.8)' }]}>{t('msg-edited')}</Text>}
    </>
  );

  const avatar = (
    <AvatarView
      expression={msg.avatar_expression}
      color={msg.avatar_color}
      username={msg.username}
      screenname={msg.screenname}
      size={32}
    />
  );

  // Desktop hover actions: [react] [edit?] [recall?]
  // Clicking react measures its position and hands off to ChatPanel for the popup
  const hoverActions = showHoverActions ? (
    <View style={s.hoverActions}>
      <TouchableOpacity ref={reactBtnRef} style={s.hoverBtn} onPress={handleReactBtnPress} activeOpacity={0.7}
        accessibilityLabel={t('emoji')}>
        <IconEmoji size={17} color={c.textMuted} />
      </TouchableOpacity>
      {onEdit && (
        <TouchableOpacity style={s.hoverBtn} onPress={onEdit} activeOpacity={0.7}>
          <Text style={[s.hoverBtnText, { color: c.textMuted }]}>{t('edit')}</Text>
        </TouchableOpacity>
      )}
      {onRecall && (
        <TouchableOpacity style={s.hoverBtn} onPress={onRecall} activeOpacity={0.7}>
          <Text style={[s.hoverBtnText, { color: c.danger }]}>{t('recall')}</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  return (
    <View style={[s.row, isOwn && s.rowOwn]} {...hoverHandlers as any}>
      {avatar}

      <View style={[s.body, isOwn ? s.bodyOwn : s.bodyOther]}>
        {!isOwn && (
          <Text style={[s.name, { color: msg.avatar_color || getAvatarColor(msg.username) }]}>
            {msg.screenname}
          </Text>
        )}

        <View style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}>
          <TouchableOpacity
            onLongPress={onLongPress}
            delayLongPress={350}
            activeOpacity={0.85}
            disabled={!onLongPress}
            style={s.bubbleTouch}
          >
            <View style={[s.bubble, { backgroundColor: isOwn ? c.bubbleOwn : c.bubbleOther }]}>
              {bubbleContent}
            </View>
          </TouchableOpacity>
          {hoverActions}
        </View>

        {hasReactions && (
          <View style={[s.reactionsRow, isOwn && s.reactionsRowOwn]}>
            {Object.entries(msg.reactions!).map(([emoji, users]) =>
              users.length > 0 ? (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    s.reactionPill,
                    { backgroundColor: c.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                    users.includes(currentUsername ?? '') && s.reactionPillActive,
                  ]}
                  onPress={() => onReactionPress?.(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={s.reactionEmoji}>{emoji}</Text>
                  <Text style={[s.reactionCount, { color: c.textMuted }]}>{users.length}</Text>
                </TouchableOpacity>
              ) : null
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-end',
    gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 2,
  },
  rowOwn: { flexDirection: 'row-reverse' },

  body: { gap: 2, minWidth: 0 },
  bodyOther: { flex: 1 },
  bodyOwn: { flexShrink: 1, alignItems: 'flex-end', maxWidth: '72%' },

  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bubbleRowOwn: { flexDirection: 'row-reverse' },

  name: { fontSize: 13, fontWeight: String(Fonts.semibold) as any, marginBottom: 1 },

  // Without shrink the bubble grows to the text's full length instead of wrapping
  bubbleTouch: { flexShrink: 1, minWidth: 0, maxWidth: '85%' },
  bubble: { borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },

  // web: long URLs / unbroken strings wrap instead of widening the bubble
  text: { fontSize: 15, lineHeight: 22, ...(Platform.OS === 'web' ? { wordBreak: 'break-word' } : {}) } as any,
  editedLabel: { fontSize: 11, marginTop: 2 },
  recalled: { fontSize: 14, fontStyle: 'italic' },

  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  reactionPillActive: {
    backgroundColor: 'rgba(79,142,247,0.13)',
    borderColor: 'rgba(79,142,247,0.45)',
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 12 },

  hoverActions: { flexDirection: 'row', alignItems: 'center', gap: 1, flexShrink: 0 },
  hoverBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 5 },
  hoverBtnText: { fontSize: 13 },
});

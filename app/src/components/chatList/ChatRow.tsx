import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AvatarView } from '../AvatarView';
import { IconBellOff, IconClose, IconHash, IconLock, IconMore, IconPin } from '../Icon';
import { SwipeRow } from '../ui/SwipeRow';
import { isTouchScreen } from '../../lib/pointer';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { Fonts, Radius } from '../../theme';
import { preview, type ChatEntry } from './model';

interface Props {
  entry: ChatEntry;
  me: string | undefined;
  active: boolean;
  onPress: () => void;
  /** Mouse screens: the ⋯ on a hovered row, at the pointer */
  onMenu: (at: { x: number; y: number }) => void;
  onPin: () => void;
  onMute: () => void;
  onCloseDm: () => void;
  /** Touch screens: the row slid open to show its actions (one at a time, owned by the list) */
  swiped: boolean;
  onSwipedChange: (open: boolean) => void;
}

/** One room or DM in the list: its face, name, preview line, marks and unread count, with
 *  pin / mute / close under a swipe (touch) or behind ⋯ on hover (mouse). */
export function ChatRow(p: Props) {
  const c = useColors();
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const { entry, active } = p;

  const line = preview(entry.last, p.me);
  const previewText =
    line.kind === 'recalled' ? t('msg-recalled')
      : line.kind === 'system' ? t.system({ text: line.last.text, meta: line.last.meta })
      : line.kind === 'message' ? (line.mine ? t('preview-you', { text: line.photo ? t('photo') : line.text }) : line.photo ? t('photo') : line.text)
      : '';

  const row = (
    <Pressable
      style={({ pressed }) => [s.row, active && { backgroundColor: c.accentBg }, pressed && { opacity: 0.75 }]}
      // With a row slid open, a tap just closes it
      onPress={() => (p.swiped ? p.onSwipedChange(false) : p.onPress())}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {entry.kind === 'room' ? (
        <View style={[s.roomIcon, { backgroundColor: active ? c.accent : c.accentBg }]}>
          <IconHash size={18} color={active ? c.onAccent : c.accent} />
        </View>
      ) : (
        <View>
          <AvatarView expression={entry.avatarExpression} color={entry.avatarColor}
            username={entry.otherUsername} screenname={entry.name} size={40} />
          {entry.online && (
            <View style={[s.onlineDot, { backgroundColor: c.success, borderColor: active ? c.accentBg : c.surface }]}
              accessibilityLabel={t('online')} />
          )}
        </View>
      )}
      <View style={s.text}>
        <View style={s.nameLine}>
          <Text style={[s.name, { color: active ? c.accentText : c.text }, active && s.nameActive]} numberOfLines={1}>
            {entry.kind === 'room' ? t.room(entry.name) : entry.name}
          </Text>
          {entry.pinned && <View accessibilityLabel={t('pinned')}><IconPin size={12} color={c.textMuted} /></View>}
          {entry.muted && <View accessibilityLabel={t('muted-chat')}><IconBellOff size={12} color={c.textMuted} /></View>}
        </View>
        {!!previewText && (
          <Text style={[s.preview, { color: entry.unread > 0 ? c.text : c.textSub }, entry.unread > 0 && s.previewUnread]}
            numberOfLines={1}>
            {previewText}
          </Text>
        )}
      </View>
      {entry.kind === 'room' && entry.hasPassword && <IconLock size={13} color={c.textMuted} />}
      {entry.unread > 0 && (
        // Muted chats still count, quietly
        <View style={[s.badge, { backgroundColor: entry.muted ? c.surface2 : c.unread }]} accessibilityLabel={`${entry.unread}`}>
          <Text style={[s.badgeText, { color: entry.muted ? c.textSub : c.unreadText }]}>{entry.unread > 99 ? '99+' : entry.unread}</Text>
        </View>
      )}
    </Pressable>
  );

  // Mouse: ⋯ (and × on a DM) over the row's right end while hovered. Beside the row, not in it:
  // the row is a <button>, and a button inside a button never gets the click. (react-native-web
  // passes mouse events through on a plain View.)
  const hoverable = (
    <View {...({ onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } as any)}>
      {row}
      {hovered && !isTouchScreen && (
        <View style={[s.tools, { backgroundColor: active ? c.accentBg : c.surface }]}>
          <Pressable style={({ hovered: h }: any) => [s.tool, h && { backgroundColor: c.surface2 }]}
            onPress={(e) => p.onMenu({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
            accessibilityRole="button" accessibilityLabel={t('more-options')}>
            <IconMore size={14} color={c.textSub} />
          </Pressable>
          {entry.kind === 'dm' && (
            <Pressable style={({ hovered: h }: any) => [s.tool, h && { backgroundColor: c.surface2 }]}
              onPress={() => { setHovered(false); p.onCloseDm(); }}
              accessibilityRole="button" accessibilityLabel={t('close-dm')}>
              <IconClose size={12} color={c.textSub} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );

  // Touch: slide left to pin, mute or (a DM) close
  const then = (run: () => void) => () => { p.onSwipedChange(false); run(); };
  return (
    <SwipeRow
      enabled={isTouchScreen}
      open={p.swiped}
      onOpenChange={p.onSwipedChange}
      background={c.surface}
      actions={[
        {
          label: entry.pinned ? t('unpin') : t('pin'), icon: <IconPin size={16} color={c.onAccent} />,
          color: c.accent, textColor: c.onAccent, onPress: then(p.onPin),
        },
        {
          label: entry.muted ? t('unmute-chat') : t('mute-chat'), icon: <IconBellOff size={16} color={c.sunnyText} />,
          color: c.sunny, textColor: c.sunnyText, onPress: then(p.onMute),
        },
        ...(entry.kind === 'dm' ? [{
          label: t('close'), icon: <IconClose size={16} color={c.onAccent} />,
          color: c.danger, textColor: c.onAccent, onPress: then(p.onCloseDm),
        }] : []),
      ]}
    >
      {hoverable}
    </SwipeRow>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14 },
  roomIcon: { width: 36, height: 36, borderRadius: 12, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2.5 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 15, fontWeight: String(Fonts.bold) as any, flexShrink: 1 },
  nameActive: { fontWeight: String(Fonts.heavy) as any },
  preview: { fontSize: 13 },
  previewUnread: { fontWeight: String(Fonts.bold) as any },
  badge: { minWidth: 22, height: 22, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  badgeText: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  tools: { position: 'absolute', right: 8, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 6 },
  tool: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

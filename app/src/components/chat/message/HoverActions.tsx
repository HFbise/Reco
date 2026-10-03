import { useRef } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconEmoji, IconFlag, IconPencil, IconPin, IconReply, IconTrash } from '../../Icon';
import { useColors } from '../../../hooks/useColors';
import { useT } from '../../../hooks/useT';

export interface HoverHandlers {
  onReply?: () => void;
  /** The 😊 button: where it is on the page, so the reaction bar can open next to it */
  onReact?: (at: { pageX: number; pageY: number; height: number }) => void;
  onEdit?: () => void;
  onRecall?: () => void;
  /** Someone else's message: report it to the moderators */
  onReport?: () => void;
  /** Pin it to the chat (or unpin it, when `pinned`) */
  onPin?: () => void;
  pinned?: boolean;
}

/** Desktop: reply / react / edit / pin / recall / report beside a hovered bubble. Placed outside the bubble's
 *  box (absolutely), so showing them never changes how the text wraps. */
export function HoverActions({ own, ...h }: HoverHandlers & { own: boolean }) {
  const c = useColors();
  const t = useT();
  const reactButton = useRef<any>(null);

  function react() {
    const button = reactButton.current;
    // Web: the browser's own box. The message list is inverted with a scaleY(-1) transform, which
    // react-native-web's measure() ignores: it put the reaction bar at the mirrored height.
    if (Platform.OS === 'web' && button?.getBoundingClientRect) {
      const box = button.getBoundingClientRect();
      h.onReact?.({ pageX: box.left, pageY: box.top, height: box.height });
      return;
    }
    if (!button?.measure) { h.onReact?.({ pageX: 0, pageY: 0, height: 0 }); return; }
    button.measure((_x: number, _y: number, _w: number, height: number, pageX: number, pageY: number) =>
      h.onReact?.({ pageX, pageY, height }));
  }

  return (
    <View style={[s.bar, own ? s.leftOfBubble : s.rightOfBubble, { backgroundColor: c.surface, borderColor: c.border }]}>
      {h.onReply && (
        <TouchableOpacity style={s.button} onPress={h.onReply} activeOpacity={0.7} accessibilityLabel={t('reply')}>
          <IconReply size={17} color={c.textSub} />
        </TouchableOpacity>
      )}
      {h.onReact && (
        <TouchableOpacity ref={reactButton} style={s.button} onPress={react} activeOpacity={0.7} accessibilityLabel={t('emoji')}>
          <IconEmoji size={17} color={c.textSub} />
        </TouchableOpacity>
      )}
      {h.onEdit && (
        <TouchableOpacity style={s.button} onPress={h.onEdit} activeOpacity={0.7} accessibilityLabel={t('edit')}>
          <IconPencil size={16} color={c.textSub} />
        </TouchableOpacity>
      )}
      {h.onPin && (
        <TouchableOpacity style={s.button} onPress={h.onPin} activeOpacity={0.7} accessibilityLabel={t(h.pinned ? 'unpin-message' : 'pin-message')}>
          <IconPin size={15} color={h.pinned ? c.accent : c.textSub} />
        </TouchableOpacity>
      )}
      {h.onRecall && (
        <TouchableOpacity style={s.button} onPress={h.onRecall} activeOpacity={0.7} accessibilityLabel={t('recall')}>
          <IconTrash size={16} color={c.danger} />
        </TouchableOpacity>
      )}
      {h.onReport && (
        <TouchableOpacity style={s.button} onPress={h.onReport} activeOpacity={0.7} accessibilityLabel={t('report-message')}>
          <IconFlag size={15} color={c.textSub} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', top: '50%', transform: [{ translateY: -18 }],
    flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderRadius: 10, borderWidth: 1,
  },
  leftOfBubble: { right: '100%', marginRight: 6 },
  rightOfBubble: { left: '100%', marginLeft: 6 },
  button: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

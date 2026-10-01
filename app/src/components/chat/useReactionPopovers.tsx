import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { EmojiPicker, POPOVER_H, POPOVER_W } from '../emoji/EmojiPicker';
import { ReactionQuickBar } from './ReactionQuickBar';
import { useColors } from '../../hooks/useColors';

const BAR_H = 54;
const BAR_W = 360;

/** Where the chat panel is on the page: popovers are placed inside it. */
export interface PanelBox { x: number; y: number; w: number }

/**
 * Choosing a reaction. Desktop: the 😊 beside a hovered message opens a bar of quick emoji next
 * to it, and its "+" the full picker in the same place. Phones: the long-press sheet's "+" opens
 * the full picker as a sheet.
 */
export function useReactionPopovers({ panel, sheet, quick, recent, react }: {
  panel: PanelBox;
  /** Phone layout: the picker is a bottom sheet */
  sheet: boolean;
  quick: string[];
  recent: string[];
  react: (messageId: number, emoji: string) => void;
}) {
  const c = useColors();
  const [bar, setBar] = useState<{ messageId: number; top: number; left: number } | null>(null);
  const [picker, setPicker] = useState<{ messageId: number; top?: number; left?: number } | null>(null);

  /** The 😊 button at (pageX, pageY), `height` tall. Pressing it again on the same message closes the bar. */
  function openBar(messageId: number, at: { pageX: number; pageY: number; height: number }) {
    if (bar?.messageId === messageId) { setBar(null); return; }
    const above = at.pageY - panel.y - BAR_H - 8;
    const top = above < 8 ? at.pageY - panel.y + at.height + 8 : above;
    const left = Math.min(Math.max(4, at.pageX - panel.x - 160), Math.max(4, (panel.w || 800) - BAR_W - 4));
    setBar({ messageId, top, left });
  }

  function openPicker(messageId: number) {
    setPicker({ messageId });
  }

  const element = (
    <>
      {bar && (
        <>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setBar(null)} activeOpacity={0} />
          <ReactionQuickBar
            style={{ position: 'absolute', top: bar.top, left: bar.left, zIndex: 300 } as any}
            emojis={quick}
            c={c}
            onSelect={(emoji) => { react(bar.messageId, emoji); setBar(null); }}
            onMore={() => {
              // The full picker where the bar was (below it if there's no room above)
              const above = bar.top - POPOVER_H - 8;
              const top = above < 8 ? bar.top + BAR_H + 8 : above;
              const left = Math.min(Math.max(4, bar.left), (panel.w || 800) - POPOVER_W - 8);
              setPicker({ messageId: bar.messageId, top, left });
              setBar(null);
            }}
          />
        </>
      )}
      <EmojiPicker
        visible={!!picker}
        sheet={sheet}
        position={picker?.top != null ? { top: picker.top, left: picker.left ?? 4 } : { bottom: 76, left: 12 }}
        recent={recent}
        onClose={() => setPicker(null)}
        onSelect={(emoji) => { if (picker) react(picker.messageId, emoji); setPicker(null); }}
      />
    </>
  );

  return { openBar, openPicker, closeBar: () => setBar(null), element };
}

import { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { ImageViewer } from '../ImageViewer';
import { fitImage, imageUrl } from '../../../lib/images';
import { getAvatarColor, nameColor } from '../../../lib/avatar';
import { splitMentions } from '../../../lib/mentions';
import { useDisplayName } from '../../../store/peopleStore';
import { useColors } from '../../../hooks/useColors';
import { useT } from '../../../hooks/useT';
import { TEXT_SIZES, usePrefsStore } from '../../../store/prefsStore';
import { Fonts } from '../../../theme';
import type { Message } from './types';

/** What's inside a bubble: the quote it answers, a photo, the text, "edited" (or just
 *  "message recalled"). Colors follow the bubble: on your own (accent) ones, light on dark. */
export function BubbleBody({ msg, me, onQuotePress, onMentionPress }: {
  msg: Message; me: string | undefined; onQuotePress?: (id: number) => void;
  /** An @mention was tapped */
  onMentionPress?: (username: string, screenname: string) => void;
}) {
  const c = useColors();
  const t = useT();
  const [viewing, setViewing] = useState(false);
  const textSize = TEXT_SIZES[usePrefsStore((p) => p.textSize)];
  const name = useDisplayName();
  const own = msg.isOwn;
  const faint = own ? 'rgba(255,255,255,0.7)' : c.textMuted;

  if (msg.recalled) return <Text style={[s.recalled, { color: faint }]}>{t('msg-recalled')}</Text>;

  const reply = msg.reply;
  const image = msg.meta?.image;
  const quoteName = reply ? (reply.username === me ? t('you') : reply.screenname) : '';
  const quoteColor = reply ? nameColor(getAvatarColor(reply.username), c.isDark, own ? c.bubbleOwn : c.bubbleOther) : '';

  return (
    <>
      {reply && (
        <TouchableOpacity
          onPress={() => onQuotePress?.(reply.id)}
          activeOpacity={0.7}
          disabled={!onQuotePress}
          accessibilityRole="button"
          accessibilityLabel={`${t('reply-to', { name: quoteName })}: ${reply.recalled ? t('msg-recalled') : reply.text}`}
          style={[s.quote, {
            backgroundColor: own ? 'rgba(255,255,255,0.14)' : c.surface2,
            borderLeftColor: own ? c.onAccent : quoteColor,
          }]}
        >
          <Text style={[s.quoteName, { color: own ? c.onAccent : quoteColor }]} numberOfLines={1}>{quoteName}</Text>
          <Text style={[s.quoteText, { color: own ? 'rgba(255,255,255,0.85)' : c.textSub }, reply.recalled && s.italic]}
            numberOfLines={2}>
            {reply.recalled ? t('msg-recalled') : reply.text}
          </Text>
        </TouchableOpacity>
      )}
      {image && (
        <TouchableOpacity onPress={() => setViewing(true)} activeOpacity={0.9} accessibilityRole="imagebutton"
          accessibilityLabel={t('photo')}>
          <Image source={{ uri: imageUrl(image.id) }} resizeMode="cover"
            style={[s.photo, fitImage(image.w, image.h), { backgroundColor: c.surface2 }]} />
        </TouchableOpacity>
      )}
      {!!msg.text && (
        <Text style={[s.text, textSize, { color: own ? c.onAccent : c.text }, !!image && s.caption]}>
          {splitMentions(msg.text, msg.meta?.mentions, msg.meta?.everyone).map((part, i) => ('text' in part ? part.text
            : 'everyone' in part ? (
            // @everyone means you too (unless you wrote it)
            <Text key={i} style={[s.mention, own
              ? { backgroundColor: 'rgba(255,255,255,0.2)', color: c.onAccent } : { backgroundColor: c.sunny, color: c.sunnyText }]}>
              @{t('mention-everyone')}
            </Text>
          ) : (
            // @Screenname; you, in the sunny color
            <Text key={i} onPress={onMentionPress && (() => onMentionPress(part.username, part.screenname))} suppressHighlighting
              accessibilityRole={onMentionPress ? 'link' : undefined}
              style={[s.mention, part.username === me
              ? { backgroundColor: c.sunny, color: c.sunnyText }
              : own ? { backgroundColor: 'rgba(255,255,255,0.2)', color: c.onAccent } : { backgroundColor: c.accentBg, color: c.accentText }]}>
              @{name(part.username, part.screenname)}
            </Text>
          )))}
        </Text>
      )}
      {msg.edited && <Text style={[s.edited, { color: faint }]}>{t('msg-edited')}</Text>}
      {viewing && image && <ImageViewer image={image} onClose={() => setViewing(false)} />}
    </>
  );
}

/** A bubble holding only a photo gets a thin frame instead of the text padding. */
export const photoOnly = (msg: Message) => !msg.recalled && !!msg.meta?.image && !msg.text && !msg.reply;

const s = StyleSheet.create({
  // web: long URLs and unbroken strings wrap instead of widening the bubble
  text: { fontSize: 15, lineHeight: 22, ...(Platform.OS === 'web' ? { wordBreak: 'break-word' } : {}) } as any,
  caption: { marginTop: 8 },
  photo: { borderRadius: 16 },
  edited: { fontSize: 11, marginTop: 2 },
  mention: { fontWeight: String(Fonts.heavy) as any, borderRadius: 6, paddingHorizontal: 2 },
  recalled: { fontSize: 14, fontStyle: 'italic' },
  italic: { fontStyle: 'italic' },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, marginBottom: 6, gap: 1 },
  quoteName: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  quoteText: { fontSize: 13, lineHeight: 17 },
});

import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { GuestBanner } from '../GuestBanner';
import { MentionPicker } from './MentionPicker';
import { IconBan, IconClose, IconEmoji, IconImage, IconPencil, IconReply, IconSend } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { isSendKey } from '../../lib/keys';
import { activeMention, applyMention, matchMembers, type Mentionable } from '../../lib/mentions';
import { usePrefsStore } from '../../store/prefsStore';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props {
  input: string;
  onChangeInput: (text: string) => void;
  onSend: () => void;
  emojiOpen: boolean;
  onToggleEmoji: () => void;
  /** Non-null while editing one of your own messages */
  editText: string | null;
  onChangeEdit: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  isMuted: boolean;
  isGuest: boolean;
  /** Set while answering a message: who wrote it and how it starts */
  replyingTo?: { name: string; text: string } | null;
  onCancelReply?: () => void;
  /** Pick and send a photo (web); shown as a button next to the emoji one */
  onAttach?: () => void;
  uploading?: boolean;
  /** People who can be @mentioned (rooms; none in DMs), and you */
  mentionable?: Mentionable[];
  me?: string;
}

// The message box starts one line tall and grows with what's typed, up to a limit
const MIN_INPUT = 40;
const MAX_INPUT = 120;

/** The bottom of the chat: message box, or the edit / muted / demo-guest variants. */
export function Composer(p: Props) {
  const c = useColors();
  const t = useT();
  const enterSends = usePrefsStore((s) => s.enterSends);
  const [inputHeight, setInputHeight] = useState(MIN_INPUT);
  // The box grows with its text, but on the web the measured height never drops below the box's
  // own, so it can't shrink by itself: start over at one line once it's empty (sent or cleared)
  useEffect(() => { if (!p.input) setInputHeight(MIN_INPUT); }, [p.input]);
  const inputRef = useRef<TextInput>(null);
  // Picking "Reply" puts the cursor in the box, ready to type
  useEffect(() => { if (p.replyingTo) inputRef.current?.focus(); }, [p.replyingTo]);

  // @mentions: suggestions while an @name is typed at the cursor (Escape hides them for that @)
  const [cursor, setCursor] = useState(0);
  const [highlighted, setHighlighted] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(-1);
  const mention = p.mentionable ? activeMention(p.input, cursor) : null;
  const suggestions = mention && mention.start !== dismissedAt ? matchMembers(p.mentionable!, mention.query, p.me) : [];
  const picking = suggestions.length > 0;
  useEffect(() => { setHighlighted(0); }, [mention?.start, mention?.query]);

  function pick(person: Mentionable) {
    if (!mention) return;
    const next = applyMention(p.input, mention, cursor, person.username);
    p.onChangeInput(next.text);
    setCursor(next.cursor);
    // After the new text is in the box: put the cursor just past the name
    requestAnimationFrame(() => {
      const box = inputRef.current as any;
      box?.focus?.();
      if (box?.setSelectionRange) box.setSelectionRange(next.cursor, next.cursor);
      else box?.setSelection?.(next.cursor, next.cursor);
    });
  }

  /** Keys while suggestions show: arrows move, Enter or Tab picks, Escape hides. True if used. */
  function pickerKey(e: { key?: string; isComposing?: boolean; keyCode?: number }) {
    if (!picking || e.isComposing || e.keyCode === 229) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((i) => (i + step + suggestions.length) % suggestions.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      pick(suggestions[Math.min(highlighted, suggestions.length - 1)]);
      return true;
    }
    if (e.key === 'Escape') {
      setDismissedAt(mention!.start);
      return true;
    }
    return false;
  }

  if (p.editText !== null) {
    return (
      <View style={[s.inputArea, { backgroundColor: c.bg }]}>
        <View style={[s.editCard, { backgroundColor: c.surface, borderColor: c.accent }]}>
          <View style={s.editHead}>
            <IconPencil size={14} color={c.accent} />
            <Text style={[s.editLabel, { color: c.accentText }]}>{t('edit-message')}</Text>
          </View>
          <TextInput
            style={[s.editInput, { color: c.text }]}
            value={p.editText}
            onChangeText={p.onChangeEdit}
            autoFocus
            multiline
          />
          <View style={s.editActions}>
            <TouchableOpacity onPress={p.onCancelEdit} style={[s.editBtn, { backgroundColor: c.surface2 }]} accessibilityRole="button">
              <Text style={[s.editBtnText, { color: c.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={p.onSaveEdit} style={[s.editBtn, { backgroundColor: c.accent }]} accessibilityRole="button">
              <Text style={[s.editBtnText, { color: c.onAccent }]}>{t('save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }
  if (p.isGuest) return <GuestBanner />;
  if (p.isMuted) {
    return (
      <View style={[s.inputArea, { backgroundColor: c.bg }]}>
        <View style={[s.muted, { backgroundColor: c.dangerBg }]}>
          <IconBan size={16} color={c.danger} />
          <Text style={[s.mutedText, { color: c.danger }]}>{t('you-are-muted')}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.inputArea, { backgroundColor: c.bg }]}>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }, !c.isDark && s.cardLifted]}>
        {picking && (
          <MentionPicker people={suggestions} highlighted={Math.min(highlighted, suggestions.length - 1)}
            onPick={pick} onHover={setHighlighted} />
        )}
        {p.replyingTo && (
          <View style={[s.replyBar, { backgroundColor: c.surface2 }]}>
            <IconReply size={16} color={c.accent} />
            <View style={s.replyText}>
              <Text style={[s.replyName, { color: c.accentText }]} numberOfLines={1}>
                {t('replying-to', { name: p.replyingTo.name })}
              </Text>
              <Text style={[s.replySnippet, { color: c.textSub }]} numberOfLines={1}>{p.replyingTo.text}</Text>
            </View>
            <TouchableOpacity onPress={p.onCancelReply} hitSlop={8} accessibilityLabel={t('cancel-reply')} style={s.replyClose}>
              <IconClose size={12} color={c.textSub} />
            </TouchableOpacity>
          </View>
        )}
        <View style={s.row}>
        <TouchableOpacity style={s.emojiBtn} onPress={p.onToggleEmoji} activeOpacity={0.7} accessibilityLabel={t('emoji')}>
          <IconEmoji size={22} color={p.emojiOpen ? c.accent : c.textSub} />
        </TouchableOpacity>
        {p.onAttach && (
          <TouchableOpacity style={s.emojiBtn} onPress={p.onAttach} disabled={p.uploading} activeOpacity={0.7}
            accessibilityLabel={p.uploading ? t('uploading') : t('attach-image')}>
            {p.uploading ? <ActivityIndicator size="small" color={c.accent} /> : <IconImage size={21} color={c.textSub} />}
          </TouchableOpacity>
        )}
        <TextInput
          ref={inputRef}
          style={[s.input, { color: c.text, height: inputHeight }]}
          numberOfLines={1}
          onContentSizeChange={(e) =>
            setInputHeight(Math.min(MAX_INPUT, Math.max(MIN_INPUT, Math.ceil(e.nativeEvent.contentSize.height))))}
          placeholder={t('ph-message')}
          placeholderTextColor={c.textMuted}
          value={p.input}
          onChangeText={p.onChangeInput}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.end)}
          onSubmitEditing={() => (picking ? pick(suggestions[Math.min(highlighted, suggestions.length - 1)]) : p.onSend())}
          returnKeyType="send"
          multiline
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && pickerKey(e.nativeEvent)) {
              e.preventDefault?.();
              return;
            }
            // Web: Enter sends and Shift+Enter adds a line (or, by setting, Ctrl/⌘+Enter sends).
            // Not while an input method is composing: there Enter picks the candidate (e.g. pinyin)
            if (Platform.OS === 'web' && isSendKey(e.nativeEvent, enterSends)) {
              e.preventDefault?.();
              p.onSend();
            }
          }}
        />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: c.accent }, !p.input.trim() && s.sendBtnDisabled]}
          onPress={p.onSend} activeOpacity={0.8} accessibilityLabel={t('send')}>
          <IconSend size={18} color={c.onAccent} />
        </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  inputArea: { paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 16 },
  // One card holds the emoji button, the text and the send button
  card: { borderRadius: 20, borderWidth: 1, padding: 6, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 7, paddingLeft: 12, paddingRight: 8 },
  replyText: { flex: 1, minWidth: 0 },
  replyName: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  replySnippet: { fontSize: 13 },
  replyClose: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardLifted: { shadowColor: '#161A23', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  emojiBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, paddingHorizontal: 6, paddingVertical: 10, fontSize: 15, lineHeight: 20, outlineStyle: 'none' } as any,
  sendBtn: { borderRadius: 14, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  editCard: { borderRadius: 20, borderWidth: 2, padding: 12, gap: 8 },
  editHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  editLabel: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  editInput: { fontSize: 15, lineHeight: 20, paddingHorizontal: 4, paddingVertical: 4, maxHeight: 120, outlineStyle: 'none' } as any,
  editActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  editBtn: { height: 36, paddingHorizontal: Spacing.lg, borderRadius: Radius.md, justifyContent: 'center' },
  editBtnText: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  muted: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 20 },
  mutedText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
});

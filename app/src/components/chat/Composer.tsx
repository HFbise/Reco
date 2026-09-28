import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { GuestBanner } from '../GuestBanner';
import { IconBan, IconEmoji, IconSend } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { isSendKey } from '../../lib/keys';
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
}

// The message box starts one line tall and grows with what's typed, up to a limit
const MIN_INPUT = 40;
const MAX_INPUT = 120;

/** The bottom of the chat: message box, or the edit / muted / demo-guest variants. */
export function Composer(p: Props) {
  const c = useColors();
  const t = useT();
  const [inputHeight, setInputHeight] = useState(MIN_INPUT);

  if (p.editText !== null) {
    return (
      <View style={[s.editBar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Text style={[s.editLabel, { color: c.accent }]}>{t('edit-message')}</Text>
        <TextInput
          style={[s.editInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
          value={p.editText}
          onChangeText={p.onChangeEdit}
          autoFocus
          multiline
        />
        <View style={s.editActions}>
          <TouchableOpacity onPress={p.onCancelEdit}
            style={[s.editBtn, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
            <Text style={[s.editBtnText, { color: c.text }]}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={p.onSaveEdit} style={[s.editBtn, { backgroundColor: c.accent }]}>
            <Text style={[s.editBtnText, { color: '#fff' }]}>{t('save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  if (p.isGuest) return <GuestBanner />;
  if (p.isMuted) {
    return (
      <View style={[s.mutedArea, { backgroundColor: c.bg, borderTopColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconBan size={15} color={c.danger} />
          <Text style={[s.mutedText, { color: c.danger }]}>{t('you-are-muted')}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.inputArea, { backgroundColor: c.bg }]}>
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }, !c.isDark && s.cardLifted]}>
        <TouchableOpacity style={s.emojiBtn} onPress={p.onToggleEmoji} activeOpacity={0.7} accessibilityLabel={t('emoji')}>
          <IconEmoji size={22} color={p.emojiOpen ? c.accent : c.textSub} />
        </TouchableOpacity>
        <TextInput
          style={[s.input, { color: c.text, height: inputHeight }]}
          numberOfLines={1}
          onContentSizeChange={(e) =>
            setInputHeight(Math.min(MAX_INPUT, Math.max(MIN_INPUT, Math.ceil(e.nativeEvent.contentSize.height))))}
          placeholder={t('ph-message')}
          placeholderTextColor={c.textMuted}
          value={p.input}
          onChangeText={p.onChangeInput}
          onSubmitEditing={p.onSend}
          returnKeyType="send"
          multiline
          onKeyPress={(e: any) => {
            // Web: Enter sends, Shift+Enter adds a line. Not while an input method is composing:
            // there Enter picks the candidate (e.g. pinyin), it doesn't mean "send"
            if (Platform.OS === 'web' && isSendKey(e.nativeEvent)) {
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
  );
}

const s = StyleSheet.create({
  inputArea: { paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 16 },
  // One card holds the emoji button, the text and the send button
  card: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, borderWidth: 1, padding: 6, paddingLeft: 6 },
  cardLifted: { shadowColor: '#161A23', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  emojiBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, paddingHorizontal: 6, paddingVertical: 10, fontSize: 15, lineHeight: 20, outlineStyle: 'none' } as any,
  sendBtn: { borderRadius: 14, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.45 },
  editBar: { borderTopWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  editLabel: { fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  editInput: { borderRadius: Radius.md, padding: 10, fontSize: 15, borderWidth: 1, maxHeight: 120 },
  editActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
  editBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 8, borderRadius: 5 },
  editBtnText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  mutedArea: { paddingHorizontal: Spacing.lg, paddingVertical: 16, paddingBottom: 20, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  mutedText: { fontSize: 14, fontWeight: String(Fonts.medium) as any },
});

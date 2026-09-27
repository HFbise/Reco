import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { GuestBanner } from '../GuestBanner';
import { IconEmoji, IconSend } from '../Icon';
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

/** The bottom of the chat: message box, or the edit / muted / demo-guest variants. */
export function Composer(p: Props) {
  const c = useColors();
  const t = useT();

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
        <Text style={[s.mutedText, { color: c.danger }]}>🔇 {t('you-are-muted')}</Text>
      </View>
    );
  }
  return (
    <View style={[s.inputArea, { backgroundColor: c.bg }]}>
      <TouchableOpacity style={s.emojiBtn} onPress={p.onToggleEmoji} activeOpacity={0.7} accessibilityLabel={t('emoji')}>
        <IconEmoji size={22} color={p.emojiOpen ? c.accent : c.textMuted} />
      </TouchableOpacity>
      <TextInput
        style={[s.input, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e8', color: c.text }]}
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
        onPress={p.onSend} activeOpacity={0.8}>
        <IconSend size={17} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  inputArea: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: 10, paddingBottom: 14 },
  emojiBtn: { padding: 2, borderRadius: 6 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, maxHeight: 120 },
  sendBtn: { borderRadius: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
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

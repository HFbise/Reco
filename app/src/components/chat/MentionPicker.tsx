import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AvatarView } from '../AvatarView';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { Mentionable } from '../../lib/mentions';
import { Fonts, Radius } from '../../theme';

/** People to @mention, over the message box while an @name is being typed. Arrow keys move
 *  the highlight, Enter or Tab picks (handled by the composer); a click or tap picks too. */
export function MentionPicker({ people, highlighted, onPick, onHover }: {
  people: Mentionable[];
  highlighted: number;
  onPick: (person: Mentionable) => void;
  onHover: (index: number) => void;
}) {
  const c = useColors();
  const t = useT();
  return (
    <View style={[s.box, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="menu"
      accessibilityLabel={t('mention-someone')}>
      {people.map((m, i) => {
        const on = i === highlighted;
        return (
          <TouchableOpacity key={m.username} onPress={() => onPick(m)} activeOpacity={0.8}
            {...({ onMouseEnter: () => onHover(i) } as any)}
            accessibilityRole="menuitem" accessibilityState={{ selected: on }} accessibilityLabel={`${m.screenname} @${m.username}`}
            style={[s.row, on && { backgroundColor: c.accentBg }]}>
            <AvatarView expression={m.avatar_expression} color={m.avatar_color} username={m.username} screenname={m.screenname} size={28} />
            <Text style={[s.name, { color: c.text }]} numberOfLines={1}>{m.screenname}</Text>
            <Text style={[s.handle, { color: c.textMuted }]} numberOfLines={1}>@{m.username}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, padding: 6, borderRadius: Radius.lg, borderWidth: 1,
    shadowColor: '#161A23', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, paddingHorizontal: 10, borderRadius: Radius.md },
  name: { flexShrink: 1, fontSize: 15, fontWeight: String(Fonts.bold) as any },
  handle: { flexShrink: 1, fontSize: 13 },
});

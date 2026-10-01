import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { Fonts, Radius, Spacing } from '../../theme';

/** A titled card of settings rows, with a line between rows. */
export function Group({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  const c = useColors();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={s.group}>
      {title && <Text style={[s.groupTitle, { color: c.textSub }]} accessibilityRole="header">{title}</Text>}
      <View style={[s.card, { backgroundColor: c.surface2 }]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={[s.divider, { backgroundColor: c.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
      {note && <Text style={[s.note, { color: c.textMuted }]}>{note}</Text>}
    </View>
  );
}

/** Label and optional hint on the left, `children` (a control) on the right. */
export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={s.row}>
      <View style={s.text}>
        <Text style={[s.label, { color: c.text }]}>{label}</Text>
        {!!hint && <Text style={[s.hint, { color: c.textMuted }]}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Row label={label} hint={hint}>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label}
        thumbColor={c.onAccent} trackColor={{ false: c.border, true: c.accent }}
        {...({ activeThumbColor: c.onAccent } as any)} />
    </Row>
  );
}

/** One of a few options, as a row of pills under the label. */
export function ChoiceRow<T extends string>({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: T | undefined; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={s.choice}>
      <View style={s.text}>
        <Text style={[s.label, { color: c.text }]}>{label}</Text>
        {!!hint && <Text style={[s.hint, { color: c.textMuted }]}>{hint}</Text>}
      </View>
      <View style={s.pills} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} activeOpacity={0.8}
              accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
              style={[s.pill, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accentBg : c.surface }]}>
              <Text style={[s.pillText, { color: on ? c.accentText : c.textSub }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: String(Fonts.heavy) as any, paddingHorizontal: 4 },
  card: { borderRadius: Radius.xl, paddingHorizontal: Spacing.lg },
  divider: { height: 1 },
  note: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  hint: { fontSize: 13, lineHeight: 18 },
  choice: { gap: 10, paddingVertical: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
});

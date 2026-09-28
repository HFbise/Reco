import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { DisplayText } from './DisplayText';
import { useColors } from '../../hooks/useColors';

/** Title bar for a phone tab (Match, Me): a big friendly title, optional buttons on the right. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[s.bar, { backgroundColor: c.bg }]}>
      <DisplayText style={[s.title, { color: c.text }]} numberOfLines={1}>{title}</DisplayText>
      {children && <View style={s.actions}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12 },
  title: { flex: 1, fontSize: 26 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

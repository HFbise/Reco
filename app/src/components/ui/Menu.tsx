import type { ReactNode } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { Fonts, Radius } from '../../theme';

export interface MenuItem {
  label: string;
  /** Drawn in the item's color */
  icon: (color: string) => ReactNode;
  onPress: () => void;
  /** Accent-colored icon tile (the + menu's actions), instead of a quiet grey one */
  primary?: boolean;
}

/** Where the menu's corner goes, in window coordinates: its top and its left or right edge. */
export type MenuAnchor = { top: number; left: number } | { top: number; right: number };

/** A small pop-up list of actions, closed by picking one or tapping anywhere else. */
export function Menu({ anchor, items, onClose }: { anchor: MenuAnchor | null; items: MenuItem[]; onClose: () => void }) {
  const c = useColors();
  return (
    <Modal visible={!!anchor} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} onPress={onClose} activeOpacity={1}>
        {anchor && (
          <View style={[s.menu, anchor, { backgroundColor: c.surface, borderColor: c.border }]} accessibilityRole="menu">
            {items.map((item) => (
              <TouchableOpacity key={item.label} style={s.item} activeOpacity={0.8} accessibilityRole="menuitem"
                onPress={() => { onClose(); item.onPress(); }}>
                <View style={[s.icon, { backgroundColor: item.primary ? c.accentBg : c.surface2 }]}>
                  {item.icon(item.primary ? c.accent : c.textSub)}
                </View>
                <Text style={[s.label, { color: c.text }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    position: 'absolute', minWidth: 220, borderRadius: Radius.lg, borderWidth: 1, padding: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 10,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 10, borderRadius: Radius.md },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
});

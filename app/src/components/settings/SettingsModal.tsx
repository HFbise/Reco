import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconClose } from '../Icon';
import { IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { SectionContent, sectionsFor, type SectionDeps, type SectionId } from './sections';
import { useAccountSettings } from '../../hooks/useAccountSettings';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useAuthStore } from '../../store/authStore';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props extends Omit<SectionDeps, 'account'> {
  visible: boolean;
  onClose: () => void;
}

/** Desktop settings: the sections down the left, the open one on the right. */
export function SettingsModal({ visible, onClose, voice, devices }: Props) {
  const c = useColors();
  const t = useT();
  const guest = useAuthStore((s) => !!s.currentUser?.guest);
  const account = useAccountSettings(visible && !guest);
  const sections = sectionsFor(guest);
  const [picked, setPicked] = useState<SectionId>(sections[0].id);
  const open = sections.find((sec) => sec.id === picked) ?? sections[0];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: c.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('close')} />
        <View style={[s.box, { backgroundColor: c.surface }]} accessibilityViewIsModal>
          <View style={[s.nav, { backgroundColor: c.surface2 }]}>
            <DisplayText style={[s.title, { color: c.text }]}>{t('settings')}</DisplayText>
            <View accessibilityRole="tablist" style={s.tabs}>
              {sections.map((sec) => {
                const on = sec.id === open.id;
                return (
                  <TouchableOpacity key={sec.id} onPress={() => setPicked(sec.id)} activeOpacity={0.8}
                    accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t(sec.title)}
                    style={[s.tab, on && { backgroundColor: c.surface }]}>
                    {sec.icon(on ? c.accent : c.textSub)}
                    <Text style={[s.tabText, { color: on ? c.text : c.textSub }, on && s.heavy]}>{t(sec.title)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={s.main}>
            <View style={s.head}>
              <Text style={[s.heading, { color: c.text }]} accessibilityRole="header">{t(open.title)}</Text>
              <IconButton label={t('close')} onPress={onClose} size={40} round icon={(color) => <IconClose size={18} color={color} />} />
            </View>
            <ScrollView contentContainerStyle={s.content}>
              <SectionContent id={open.id} account={account} voice={voice} devices={devices} />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  // A fixed height: switching sections doesn't make the dialog jump
  box: { flexDirection: 'row', width: '100%', maxWidth: 820, height: 600, maxHeight: '100%', borderRadius: Radius.xxl, overflow: 'hidden' },
  nav: { width: 220, padding: Spacing.lg, gap: Spacing.lg },
  title: { fontSize: 24, paddingHorizontal: 8, paddingTop: 6 },
  tabs: { gap: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, paddingHorizontal: 12, borderRadius: Radius.md },
  tabText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  heavy: { fontWeight: String(Fonts.heavy) as any },
  main: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: Spacing.xxl, paddingRight: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: 4 },
  heading: { fontSize: 20, fontWeight: String(Fonts.heavy) as any },
  content: { paddingHorizontal: Spacing.xxl, paddingBottom: Spacing.xxl, paddingTop: 8, gap: Spacing.xl },
});

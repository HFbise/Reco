import { Platform, StyleSheet, Text, View } from 'react-native';
import { ChoiceRow, Group } from './parts';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { TEXT_SIZES, usePrefsStore, type TextSize } from '../../store/prefsStore';
import { Radius } from '../../theme';

/** How chatting works on this device: the Enter key, message text size, 12/24-hour time. */
export function ChatSettings() {
  const c = useColors();
  const t = useT();
  const { enterSends, textSize, hour12, set } = usePrefsStore();
  const sample = new Date();
  sample.setHours(21, 5, 0, 0);

  return (
    <>
      <Group note={t('settings-device-note')}>
        {/* A keyboard's Enter: phones have their own return key */}
        {Platform.OS === 'web' && (
          <ChoiceRow label={t('enter-key')} hint={enterSends ? t('enter-sends-hint') : t('enter-newline-hint')}
            value={enterSends ? 'send' : 'newline'} onChange={(v) => set({ enterSends: v === 'send' })}
            options={[{ value: 'send', label: t('enter-sends') }, { value: 'newline', label: t('enter-newline') }]} />
        )}
        <ChoiceRow<TextSize> label={t('text-size')} value={textSize} onChange={(v) => set({ textSize: v })}
          options={[
            { value: 'small', label: t('text-small') },
            { value: 'default', label: t('text-default') },
            { value: 'large', label: t('text-large') },
          ]} />
        <ChoiceRow label={t('time-format')} value={hour12 ? '12' : '24'} onChange={(v) => set({ hour12: v === '12' })}
          options={[{ value: '24', label: t('clock-24') }, { value: '12', label: t('clock-12') }]} />
      </Group>
      {/* What a message will look like */}
      <View style={[s.preview, { backgroundColor: c.surface2 }]} accessibilityLabel={t('preview')}>
        <View style={[s.bubble, { backgroundColor: c.bubbleOther }]}>
          <Text style={[TEXT_SIZES[textSize], { color: c.text }]}>{t('preview-message')}</Text>
        </View>
        <Text style={[s.time, { color: c.textMuted }]}>{t.clock(sample)}</Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  preview: { borderRadius: Radius.xl, padding: 16, gap: 6, alignItems: 'flex-start' },
  bubble: { borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 320 },
  time: { fontSize: 12, marginLeft: 4 },
});

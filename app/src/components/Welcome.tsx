import { View, Text, StyleSheet } from 'react-native';
import { Button } from './ui/Button';
import { DisplayText } from './ui/DisplayText';
import { FaceRow } from './ui/FaceRow';
import { IconPlus, IconShuffle } from './Icon';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { Spacing } from '../theme';

interface Props {
  /** Opens the create / join-by-code menu */
  onJoin?: () => void;
  /** Goes to random matching (not offered to demo guests) */
  onMatch?: () => void;
}

/** What the chat area shows before a room is picked. */
export function Welcome({ onJoin, onMatch }: Props) {
  const c = useColors();
  const t = useT();
  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <FaceRow faces={[
        { expression: 'Smile', color: '#5865F2', size: 56, tilt: -10, lift: -6 },
        { expression: 'Laugh', color: '#3BA55C', size: 64, lift: 6 },
        { expression: 'BigLaugh', color: '#1A70D4', size: 80, tilt: 6, lift: 14 },
        { expression: 'Em', color: '#EB459E', size: 64, lift: 6 },
        { expression: 'Sad', color: '#FAA61A', size: 56, tilt: 10, lift: -6 },
      ]} />
      <DisplayText style={[s.title, { color: c.text }]}>{t('welcome-title')}</DisplayText>
      <Text style={[s.sub, { color: c.textSub }]}>{t('welcome-sub')}</Text>
      {(onJoin || onMatch) && (
        <View style={s.actions}>
          {onJoin && (
            <Button label={t('welcome-join')} variant="quiet" onPress={onJoin}
              icon={(color) => <IconPlus size={16} color={color} />} />
          )}
          {onMatch && (
            <Button label={t('match-title')} onPress={onMatch}
              icon={(color) => <IconShuffle size={18} color={color} />} />
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: Spacing.xxl },
  title: { fontSize: 32, textAlign: 'center', marginTop: 10 },
  sub: { fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 440 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 6 },
});

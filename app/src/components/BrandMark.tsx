import { View } from 'react-native';
import { AvatarView, EXPRESSIONS } from './AvatarView';
import { Colors } from '../theme';

// The logo wears one of the faces (logo/asset/R_*.svg), picked when the app
// loads: a different mood per visit, steady while you're using it.
const FACE = EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)];

/** Reco's logo mark: a brand-blue rounded square with a face. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Reco">
      <AvatarView expression={FACE} color={Colors.brand} size={size} style={{ borderRadius: Math.round(size * 0.3) }} />
    </View>
  );
}

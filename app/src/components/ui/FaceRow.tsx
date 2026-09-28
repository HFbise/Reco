import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { AvatarView } from '../AvatarView';

export interface Face {
  expression: string;
  color: string;
  size: number;
  /** Tilt in degrees */
  tilt?: number;
  /** Pixels up (+) or down (-) from the row's baseline */
  lift?: number;
  /** Negative to tuck the face under its neighbours */
  overlap?: number;
  /** Paint a ring of this color around the face (to stand out from overlapping neighbours) */
  ring?: string;
}

/** A playful row of logo faces for empty states and welcome screens (decorative). */
export function FaceRow({ faces, gap = 12, style }: { faces: Face[]; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.row, { gap }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {faces.map((f, i) => (
        <View
          key={`${f.expression}-${i}`}
          style={[
            {
              transform: [{ translateY: -(f.lift ?? 0) }, { rotate: `${f.tilt ?? 0}deg` }],
              marginLeft: i > 0 && f.overlap ? f.overlap : 0,
              zIndex: f.ring ? 1 : 0,
            },
            f.ring ? { borderRadius: 999, borderWidth: 5, borderColor: f.ring } : null,
          ]}
        >
          <AvatarView expression={f.expression} color={f.color} size={f.size} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
});

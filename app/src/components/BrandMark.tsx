import { useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable } from 'react-native';
import { EXPRESSIONS, ExprSvg } from './AvatarView';
import { useColors } from '../hooks/useColors';
import { Colors } from '../theme';

// Smile is left out of the logo until its artwork is redrawn (avatars still offer it)
const LOGO_FACES = EXPRESSIONS.filter((e) => e !== 'Smile');

const pick = (except?: string) => {
  const choices = LOGO_FACES.filter((e) => e !== except);
  return choices[Math.floor(Math.random() * choices.length)];
};

// The logo wears one of the faces (logo/asset/R_*.svg), picked when the app
// loads: a different mood per visit.
const FIRST_FACE = pick();

/** Reco's logo: the R bubble with a face. Tap it and it wiggles into another face. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const c = useColors();
  const [face, setFace] = useState<string>(FIRST_FACE);
  const turn = useRef(new Animated.Value(0)).current;

  function wiggle() {
    turn.stopAnimation();
    turn.setValue(0);
    const swing = (to: number, ms: number) =>
      Animated.timing(turn, { toValue: to, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' });
    // The face changes on the first swing, so the new mood arrives mid-shake
    swing(-1, 70).start(() => {
      setFace((prev) => pick(prev));
      Animated.sequence([swing(0.8, 90), swing(-0.5, 80), swing(0.25, 70), swing(0, 60)]).start();
    });
  }

  const rotate = turn.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] });
  return (
    <Pressable onPress={wiggle} accessibilityRole="button" accessibilityLabel="Reco" hitSlop={6}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <ExprSvg expression={face} width={size} height={Math.round((size * 15) / 14)} color={c.isDark ? c.accentText : Colors.brand} />
      </Animated.View>
    </Pressable>
  );
}

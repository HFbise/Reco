import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { Fonts, Radius } from '../../theme';

type Variant = 'primary' | 'secondary' | 'sunny' | 'quiet' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** 'lg' for the one main action of a screen (log in, start matching) */
  size?: 'md' | 'lg';
  /** Rendered before the label, in the label's color: pass a function of that color */
  icon?: (color: string) => ReactNode;
  busy?: boolean;
  disabled?: boolean;
  /** Pills are for voice controls and compact actions */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** The app's buttons: one look per role, instead of a new style on every screen. */
export function Button({
  label, onPress, variant = 'primary', size = 'md', icon, busy, disabled, pill, style, accessibilityLabel,
}: ButtonProps) {
  const c = useColors();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.accent, fg: c.onAccent },
    secondary: { bg: c.accentBg, fg: c.accentText },
    sunny: { bg: c.sunny, fg: c.sunnyText },
    quiet: { bg: c.surface, fg: c.text, border: c.border },
    danger: { bg: c.danger, fg: '#FFFFFF' },
  };
  const { bg, fg, border } = palette[variant];
  const inactive = disabled || busy;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={[
        s.base,
        size === 'lg' ? s.lg : s.md,
        { backgroundColor: bg, borderRadius: pill ? Radius.full : Radius.lg },
        border ? { borderWidth: 1.5, borderColor: border } : null,
        disabled && !busy ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.row}>
          {icon?.(fg)}
          <Text style={[size === 'lg' ? s.labelLg : s.label, { color: fg }]} numberOfLines={1}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

interface IconButtonProps {
  icon: (color: string) => ReactNode;
  onPress: () => void;
  /** Required: an icon alone says nothing to a screen reader */
  label: string;
  /** plain: no fill · tinted: light brand fill · raised: surface with a soft shadow · danger */
  variant?: 'plain' | 'tinted' | 'raised' | 'danger';
  size?: number;
  round?: boolean;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Square-ish (or round) icon-only button, at least 40px so it's easy to hit. */
export function IconButton({ icon, onPress, label, variant = 'plain', size = 44, round, active, style }: IconButtonProps) {
  const c = useColors();
  const look = {
    plain: { bg: active ? c.accentBg : 'transparent', fg: active ? c.accent : c.textSub },
    tinted: { bg: c.accentBg, fg: c.accent },
    raised: { bg: c.surface, fg: c.text },
    danger: { bg: c.dangerBg, fg: c.danger },
  }[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={[
        s.icon,
        { width: size, height: size, borderRadius: round ? size / 2 : Radius.md, backgroundColor: look.bg },
        variant === 'raised' ? s.raised : null,
        style,
      ]}
    >
      {icon(look.fg)}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  md: { minHeight: 46 },
  lg: { minHeight: 54 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: String(Fonts.heavy) as any },
  labelLg: { fontSize: 18, fontWeight: String(Fonts.semibold) as any, fontFamily: Fonts.display },
  icon: { alignItems: 'center', justifyContent: 'center' },
  raised: { shadowColor: '#161A23', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});

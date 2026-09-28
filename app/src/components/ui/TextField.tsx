import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { Radius } from '../../theme';

/**
 * The app's text field: tall, rounded, and clearly highlighted while focused.
 * The placeholder doubles as the accessible name unless one is given.
 */
export const TextField = forwardRef<TextInput, TextInputProps>(function TextField({ style, onFocus, onBlur, ...rest }, ref) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.textMuted}
      accessibilityLabel={rest.accessibilityLabel ?? rest.placeholder}
      {...rest}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      style={[
        s.field,
        { backgroundColor: c.surface, color: c.text, borderColor: focused ? c.accent : c.border },
        focused && s.focused,
        style,
      ]}
    />
  );
});

const s = StyleSheet.create({
  field: {
    minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg,
    borderWidth: 1.5, fontSize: 16, outlineStyle: 'none',
  } as any,
  // Same outer size while focused: the thicker border eats into the padding
  focused: { borderWidth: 2, paddingHorizontal: 15.5 },
});

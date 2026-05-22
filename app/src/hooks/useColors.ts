import { useThemeStore } from '../store/themeStore';
import { Colors, getTheme } from '../theme';

export function useColors() {
  const { isDark } = useThemeStore();
  const t = getTheme(isDark);
  return {
    isDark,
    bg: t.bg,
    surface: t.surface,
    surface2: t.surface2,
    text: t.text,
    textSub: t.textSub,
    border: t.border,
    bubbleOther: t.bubbleOther,
    accentBg: t.accentBg,
    // Fixed across themes
    accent: Colors.accent,
    textMuted: Colors.textMuted,
    danger: Colors.danger,
    unread: Colors.unread,
    success: Colors.success,
  };
}

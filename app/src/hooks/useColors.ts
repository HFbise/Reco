import { useThemeStore } from '../store/themeStore';
import { getTheme } from '../theme';

/** The active palette (see theme.ts), plus `isDark`. */
export function useColors() {
  const isDark = useThemeStore((s) => s.isDark);
  const palette = getTheme(isDark);
  return {
    isDark,
    ...palette,
    /** Unread badges use the sunny accent (with dark text on it) */
    unread: palette.sunny,
    unreadText: palette.sunnyText,
  };
}

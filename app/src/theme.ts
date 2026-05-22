// 与 web 端 main.css 保持一致的设计 token
export const Colors = {
  // 主色
  accent: '#4f8ef7',
  accentDark: '#3a7be0',
  accentBg: 'rgba(79,142,247,0.12)',
  accentBgDark: 'rgba(79,142,247,0.2)',

  // 背景
  bgLight: '#f0f0f3',
  bgDark: '#2a2b2f',
  surfaceLight: '#ffffff',
  surfaceDark: '#252528',
  surface2Light: '#383940',
  surface2Dark: '#1e1f23',

  // 文字
  textLight: '#2e3338',
  textDark: '#e0e0e5',
  textMuted: '#87888c',
  textSub: '#5c5e66',
  textSubDark: '#949ba4',

  // 边框
  borderLight: 'rgba(0,0,0,0.08)',
  borderDark: 'rgba(255,255,255,0.08)',

  // 消息气泡
  bubbleOwn: '#4f8ef7',
  bubbleOther: '#ffffff',
  bubbleOtherDark: '#383940',

  // 状态色
  danger: '#ed4245',
  success: '#3ba55c',
  warning: '#FAA61A',
  unread: '#da0909',
};

export const Fonts = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
};

export const Radius = {
  sm: 5,
  md: 8,
  lg: 12,
  xl: 14,
  full: 999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// useTheme hook 用
export function getTheme(dark: boolean) {
  return {
    bg: dark ? Colors.bgDark : Colors.bgLight,
    surface: dark ? Colors.surfaceDark : Colors.surfaceLight,
    surface2: dark ? Colors.surface2Dark : Colors.surface2Light,
    text: dark ? Colors.textDark : Colors.textLight,
    textSub: dark ? Colors.textSubDark : Colors.textSub,
    border: dark ? Colors.borderDark : Colors.borderLight,
    bubbleOther: dark ? Colors.bubbleOtherDark : Colors.bubbleOther,
    accentBg: dark ? Colors.accentBgDark : Colors.accentBg,
  };
}

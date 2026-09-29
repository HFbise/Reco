// Design tokens. Two palettes with the same keys; components read the active one
// through useColors(). Dark mode is deliberately quiet: warm greys, off-white text,
// and the blue and yellow toned down, so long evening sessions are easy on the eyes.

const light = {
  // Surfaces
  bg: '#F3F5FA', // app ground
  surface: '#FFFFFF', // panels, cards, others' message bubbles
  surface2: '#EEF1F7', // inputs, quiet buttons, voice card
  border: '#E1E6EF',
  overlay: 'rgba(22, 26, 35, 0.45)',

  // Text
  text: '#161A23',
  textSub: '#4B5366',
  textMuted: '#6B7385', // captions; still 4.5:1 on white

  // Brand blue
  accent: '#1A70D4', // fills, icons, links
  accentText: '#0F4C99', // text on accentBg
  accentBg: '#E6F0FB', // selected rows, secondary buttons
  onAccent: '#FFFFFF',

  // Sunny: unread counts and "keep in touch", used sparingly
  sunny: '#FFB020',
  sunnyText: '#3D2800',
  sunnyBg: '#FFF4DC',
  crown: '#B27700', // owner crown icon on surfaces

  // Messages
  bubbleOwn: '#1A70D4',
  bubbleOther: '#FFFFFF',

  // Status
  danger: '#D93A3A',
  dangerBg: '#FDE8E8',
  success: '#2F9E5B',
  successBg: '#E3F4EA',
  live: '#A63A06', // "LIVE" text on liveBg
  liveBg: '#FFE9DA',
};

type Palette = typeof light;

const dark: Palette = {
  bg: '#17191E',
  surface: '#1F2228',
  surface2: '#282C34',
  border: '#30343D',
  overlay: 'rgba(0, 0, 0, 0.6)',

  text: '#E4E6EB', // off-white, never pure white
  textSub: '#AAB1BF',
  textMuted: '#8C94A3',

  accent: '#4A86D6', // quieter than the light blue
  accentText: '#A9C8F2',
  accentBg: '#1F2D42',
  onAccent: '#FFFFFF',

  sunny: '#D9A441',
  sunnyText: '#2A1D00',
  sunnyBg: '#3A3020',
  crown: '#D9A441',

  bubbleOwn: '#2F5E9E', // own messages: a dim blue, not a bright block
  bubbleOther: '#282C34',

  danger: '#E0625D',
  dangerBg: '#3D2426',
  success: '#4DB37A',
  successBg: '#1E3328',
  live: '#F3A77D',
  liveBg: '#3D2A1E',
};

export function getTheme(isDark: boolean): Palette {
  return isDark ? dark : light;
}

/** Brand values that don't change with the theme (logo, splash, notification tint) */
export const Colors = {
  brand: '#1A70D4',
};

export const Fonts = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
  /** Headings and big buttons (web loads it; native falls back to the system font) */
  display: 'Fredoka, Nunito, system-ui, sans-serif',
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16, // buttons, inputs
  xl: 20, // cards
  xxl: 28, // dialogs
  full: 999,
};

/**
 * Height of every top bar (chat header, chat list, page titles), so they line up side by side
 * on desktop and while a phone swipes between screens.
 */
export const HEADER_HEIGHT = 64;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

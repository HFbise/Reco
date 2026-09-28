const AVATAR_COLORS = ['#5865F2','#3BA55C','#FAA61A','#ED4245','#EB459E','#57F287','#0099E1','#9C84EC'];

export function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) & 0x7fffffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const HEX = /^#([0-9a-f]{6})$/i;

/** Mix a #RRGGBB color toward `toward` (0 = black, 255 = white) by `amount` (0..1). */
function mix(hex: string, toward: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const v = (n >> shift) & 0xff;
    return Math.round(v + (toward - v) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** WCAG contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A soft wash of `color` over `background` (profile banners): `amount` of the
 * background shows through. Non-hex input falls back to the background.
 */
export function tint(color: string, background: string, amount: number): string {
  if (!HEX.test(color) || !HEX.test(background)) return background;
  const bg = parseInt(background.slice(1), 16);
  const n = parseInt(color.slice(1), 16);
  const channel = (shift: number) => {
    const v = (n >> shift) & 0xff;
    const b = (bg >> shift) & 0xff;
    return Math.round(v + (b - v) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/**
 * A sender's name in their avatar color, darkened (light theme) or lightened
 * (dark theme) just enough to read as small text (4.5:1) on `background`.
 */
export function nameColor(avatarColor: string, isDark: boolean, background: string): string {
  if (!HEX.test(avatarColor) || !HEX.test(background)) return avatarColor;
  const toward = isDark ? 255 : 0;
  for (let amount = 0.15; amount < 0.9; amount += 0.05) {
    const candidate = mix(avatarColor, toward, amount);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return mix(avatarColor, toward, 0.9);
}

import type { ReactNode } from 'react';
import Svg, { Path, Circle, Line, Rect, Polygon } from 'react-native-svg';

interface Props { size?: number; color?: string; }

export function IconSearch({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 19 19" fill="none">
      <Path d="M16.1875 16.1875L12.8344 12.8344M14.6458 8.47917C14.6458 11.8849 11.8849 14.6458 8.47917 14.6458C5.07341 14.6458 2.3125 11.8849 2.3125 8.47917C2.3125 5.07341 5.07341 2.3125 8.47917 2.3125C11.8849 2.3125 14.6458 5.07341 14.6458 8.47917Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPlus({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 19 19" fill="none">
      <Path d="M9.50004 3.95834V15.0417M3.95837 9.50001H15.0417" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

export function IconLogout({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
      <Path d="M7.875 18.375H4.375A1.75 1.75 0 012.625 16.625V4.375A1.75 1.75 0 014.375 2.625h3.5M14 14.875L18.375 10.5 14 6.125M18.375 10.5H7.875" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSettings({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
      <Path d="M10.5 13.125C11.9497 13.125 13.125 11.9497 13.125 10.5C13.125 9.05025 11.9497 7.875 10.5 7.875C9.05025 7.875 7.875 9.05025 7.875 10.5C7.875 11.9497 9.05025 13.125 10.5 13.125Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16.975 13.125C16.8585 13.3889 16.8238 13.6817 16.8752 13.9655C16.9267 14.2494 17.062 14.5113 17.2637 14.7175L17.3163 14.77C17.479 14.9325 17.608 15.1255 17.6961 15.338C17.7842 15.5504 17.8295 15.7781 17.8295 16.0081C17.8295 16.2381 17.7842 16.4658 17.6961 16.6783C17.608 16.8907 17.479 17.0837 17.3163 17.2462C17.1537 17.409 16.9607 17.538 16.7483 17.6261C16.5358 17.7142 16.3081 17.7595 16.0781 17.7595C15.8481 17.7595 15.6204 17.7142 15.408 17.6261C15.1955 17.538 15.0025 17.409 14.84 17.2462L14.7875 17.1937C14.5813 16.992 14.3194 16.8567 14.0355 16.8052C13.7517 16.7538 13.4589 16.7885 13.195 16.905C12.9362 17.0159 12.7155 17.2001 12.56 17.4348C12.4046 17.6696 12.3211 17.9447 12.32 18.2262V18.375C12.32 18.8391 12.1356 19.2842 11.8074 19.6124C11.4792 19.9406 11.0341 20.125 10.57 20.125C10.1059 20.125 9.66075 19.9406 9.33256 19.6124C9.00437 19.2842 8.82 18.8391 8.82 18.375V18.2962C8.81323 18.0066 8.71948 17.7257 8.55095 17.4901C8.38241 17.2545 8.14689 17.075 7.875 16.975C7.61109 16.8585 7.31833 16.8238 7.03449 16.8752C6.75064 16.9267 6.48872 17.062 6.2825 17.2637L6.23 17.3163C6.06747 17.479 5.87447 17.608 5.66202 17.6961C5.44957 17.7842 5.22185 17.8295 4.99187 17.8295C4.7619 17.8295 4.53418 17.7842 4.32173 17.6961C4.10928 17.608 3.91628 17.479 3.75375 17.3163C3.59104 17.1537 3.46196 16.9607 3.3739 16.7483C3.28583 16.5358 3.2405 16.3081 3.2405 16.0781C3.2405 15.8481 3.28583 15.6204 3.3739 15.408C3.46196 15.1955 3.59104 15.0025 3.75375 14.84L3.80625 14.7875C4.00797 14.5813 4.14329 14.3194 4.19475 14.0355C4.24622 13.7517 4.21148 13.4589 4.095 13.195C3.98408 12.9362 3.79991 12.7155 3.56516 12.56C3.3304 12.4046 3.05531 12.3211 2.77375 12.32H2.625C2.16087 12.32 1.71575 12.1356 1.38756 11.8074C1.05937 11.4792 0.875 11.0341 0.875 10.57C0.875 10.1059 1.05937 9.66075 1.38756 9.33256C1.71575 9.00437 2.16087 8.82 2.625 8.82H2.70375C2.99337 8.81323 3.27425 8.71948 3.50989 8.55095C3.74552 8.38241 3.925 8.14689 4.025 7.875C4.14148 7.61109 4.17622 7.31833 4.12475 7.03449C4.07329 6.75064 3.93797 6.48872 3.73625 6.2825L3.68375 6.23C3.52104 6.06747 3.39196 5.87447 3.3039 5.66202C3.21583 5.44957 3.1705 5.22185 3.1705 4.99187C3.1705 4.7619 3.21583 4.53418 3.3039 4.32173C3.39196 4.10928 3.52104 3.91628 3.68375 3.75375C3.84628 3.59104 4.03928 3.46196 4.25173 3.3739C4.46418 3.28583 4.6919 3.2405 4.92188 3.2405C5.15185 3.2405 5.37957 3.28583 5.59202 3.3739C5.80447 3.46196 5.99747 3.59104 6.16 3.75375L6.2125 3.80625C6.41872 4.00797 6.68064 4.14329 6.96448 4.19475C7.24833 4.24622 7.54109 4.21148 7.805 4.095H7.875C8.1338 3.98408 8.35451 3.79991 8.50998 3.56516C8.66545 3.3304 8.74888 3.05531 8.75 2.77375V2.625C8.75 2.16087 8.93437 1.71575 9.26256 1.38756C9.59075 1.05937 10.0359 0.875 10.5 0.875C10.9641 0.875 11.4092 1.05937 11.7374 1.38756C12.0656 1.71575 12.25 2.16087 12.25 2.625V2.70375C12.2511 2.98531 12.3346 3.2604 12.49 3.49516C12.6455 3.72991 12.8662 3.91408 13.125 4.025C13.3889 4.14148 13.6817 4.17622 13.9655 4.12475C14.2494 4.07329 14.5113 3.93797 14.7175 3.73625L14.77 3.68375C14.9325 3.52104 15.1255 3.39196 15.338 3.3039C15.5504 3.21583 15.7781 3.1705 16.0081 3.1705C16.2381 3.1705 16.4658 3.21583 16.6783 3.3039C16.8907 3.39196 17.0837 3.52104 17.2462 3.68375C17.409 3.84628 17.538 4.03928 17.6261 4.25173C17.7142 4.46418 17.7595 4.6919 17.7595 4.92188C17.7595 5.15185 17.7142 5.37957 17.6261 5.59202C17.538 5.80447 17.409 5.99747 17.2462 6.16L17.1937 6.2125C16.992 6.41872 16.8567 6.68064 16.8052 6.96448C16.7538 7.24833 16.7885 7.54109 16.905 7.805V7.875C17.0159 8.1338 17.2001 8.35451 17.4348 8.50998C17.6696 8.66545 17.9447 8.74888 18.2262 8.75H18.375C18.8391 8.75 19.2842 8.93437 19.6124 9.26256C19.9406 9.59075 20.125 10.0359 20.125 10.5C20.125 10.9641 19.9406 11.4092 19.6124 11.7374C19.2842 12.0656 18.8391 12.25 18.375 12.25H18.2962C18.0147 12.2511 17.7396 12.3346 17.5048 12.49C17.2701 12.6455 17.0859 12.8662 16.975 13.125Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevronLeft({ size = 20, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M12.5 5L7.5 10L12.5 15" stroke={color} strokeWidth="1.667" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSend({ size = 17, color = '#fff' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4.114 9.875h11.521M15.635 9.875L9.875 4.115M15.635 9.875L9.875 15.635" stroke={color} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconEmoji({ size = 20, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.8" />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Circle cx="9" cy="10" r="1" fill={color} />
      <Circle cx="15" cy="10" r="1" fill={color} />
    </Svg>
  );
}

export function IconLock({ size = 13, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconGroup({ size = 24, color = 'currentColor' }: Props) {
  const w = size;
  const h = Math.round(size * 22 / 30);
  return (
    <Svg width={w} height={h} viewBox="0 0 30 22" fill="none">
      <Path d="M14.0224 17.3498V15.9776C14.0224 15.2497 14.3116 14.5517 14.8262 14.037C15.3409 13.5223 16.039 13.2332 16.7668 13.2332H22.2556C22.9835 13.2332 23.6815 13.5223 24.1962 14.037C24.7109 14.5517 25 15.2497 25 15.9776V17.3498M9.90585 17.3498V15.9776C9.9063 15.3695 10.1087 14.7788 10.4812 14.2982C10.8538 13.8176 11.3754 13.4744 11.9641 13.3224M14.7085 5.08919C14.1182 5.24034 13.595 5.58366 13.2213 6.06504C12.8477 6.54641 12.6449 7.13845 12.6449 7.74782C12.6449 8.35719 12.8477 8.94923 13.2213 9.43061C13.595 9.91198 14.1182 10.2553 14.7085 10.4065M16.7668 7.74439C16.7668 9.26008 17.9955 10.4888 19.5112 10.4888C21.0269 10.4888 22.2556 9.26008 22.2556 7.74439C22.2556 6.22871 21.0269 5 19.5112 5C17.9955 5 16.7668 6.22871 16.7668 7.74439Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSun({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
      <Path d="M10.5 3.5V2M10.5 19v-1.5M3.5 10.5H2M19 10.5h-1.5M5.45 5.45 4.39 4.39M16.61 16.61l-1.06-1.06M5.45 15.55l-1.06 1.06M16.61 4.39l-1.06 1.06M14 10.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconMoon({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
      <Path d="M18.5 11.9A8 8 0 019.1 2.5a8 8 0 100 16 8 8 0 009.4-6.6z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPerson({ size = 16, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconMic({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconMicOff({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2M19 10v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPhoneOff({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M23 1L1 23M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 012.28-1.49M10.71 5.05A11 11 0 0122.7 15.84M1.42 9A11 11 0 0012.45 20.72M8.5 16.5l-2.47-2.47M17.5 7.5l-2.47 2.47" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSpeaker({ size = 17, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconInfo({ size = 13, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={Math.round(size * 14 / 15)} viewBox="0 0 15 14" fill="none">
      <Path d="M7.99996 9.33332V6.99999M7.99996 4.66666H8.00579M13.8333 6.99999C13.8333 10.2217 11.2216 12.8333 7.99996 12.8333C4.7783 12.8333 2.16663 10.2217 2.16663 6.99999C2.16663 3.77833 4.7783 1.16666 7.99996 1.16666C11.2216 1.16666 13.8333 3.77833 13.8333 6.99999Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconClose({ size = 14, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChat({ size = 20, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconShuffle({ size = 20, color = 'currentColor' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Line icons (24px grid, 2px round strokes) ────────────────

function Stroke({ size, color, width = 2, children }: { size: number; color: string; width?: number; children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function IconHeadphones({ size = 18, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></Stroke>;
}

export function IconScreenShare({ size = 18, color = 'currentColor' }: Props) {
  return (
    <Stroke size={size} color={color}>
      <Path d="m9 10 3-3 3 3" /><Path d="M12 13V7" /><Rect width="20" height="14" x="2" y="3" rx="2" /><Path d="M12 17v4" /><Path d="M8 21h8" />
    </Stroke>
  );
}

export function IconMusic({ size = 18, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Path d="M9 18V5l12-2v13" /><Circle cx="6" cy="18" r="3" /><Circle cx="18" cy="16" r="3" /></Stroke>;
}

export function IconCrown({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" /></Stroke>;
}

export function IconShield({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></Stroke>;
}

export function IconPencil({ size = 18, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><Path d="m15 5 4 4" /></Stroke>;
}

export function IconTrash({ size = 18, color = 'currentColor' }: Props) {
  return (
    <Stroke size={size} color={color}>
      <Path d="M3 6h18" /><Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </Stroke>
  );
}

export function IconVolume({ size = 18, color = 'currentColor' }: Props) {
  return (
    <Stroke size={size} color={color}>
      <Polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><Path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><Path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Stroke>
  );
}

export function IconFlag({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><Line x1="4" x2="4" y1="22" y2="15" /></Stroke>;
}

export function IconBan({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Circle cx="12" cy="12" r="10" /><Path d="m4.9 4.9 14.2 14.2" /></Stroke>;
}

export function IconUserPlus({ size = 18, color = 'currentColor' }: Props) {
  return (
    <Stroke size={size} color={color}>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Line x1="19" x2="19" y1="8" y2="14" /><Line x1="22" x2="16" y1="11" y2="11" />
    </Stroke>
  );
}

export function IconHash({ size = 18, color = 'currentColor' }: Props) {
  return (
    <Stroke size={size} color={color}>
      <Line x1="4" x2="20" y1="9" y2="9" /><Line x1="4" x2="20" y1="15" y2="15" /><Line x1="10" x2="8" y1="3" y2="21" /><Line x1="16" x2="14" y1="3" y2="21" />
    </Stroke>
  );
}

export function IconUnlock({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><Path d="M7 11V7a5 5 0 0 1 9.9-1" /></Stroke>;
}

export function IconStop({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Rect width="14" height="14" x="5" y="5" rx="2" /></Stroke>;
}

export function IconNext({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color}><Polygon points="5 4 15 12 5 20 5 4" /><Line x1="19" x2="19" y1="5" y2="19" /></Stroke>;
}

export function IconMore({ size = 20, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color} width={2.4}><Circle cx="12" cy="12" r="1" /><Circle cx="19" cy="12" r="1" /><Circle cx="5" cy="12" r="1" /></Stroke>;
}

export function IconCheck({ size = 16, color = 'currentColor' }: Props) {
  return <Stroke size={size} color={color} width={3}><Path d="M20 6 9 17l-5-5" /></Stroke>;
}

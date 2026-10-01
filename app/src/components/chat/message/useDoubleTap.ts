import { useRef } from 'react';

const DOUBLE_TAP_MS = 300;
const TAP_MS = 250;
const TAP_SLOP = 10;

/**
 * Touch handlers that call `onDoubleTap` for two quick taps. Read from the raw touches rather
 * than two presses: browsers turn quick tap pairs into clicks (or not) in their own ways, which
 * made press-based detection flaky. A tap is a short touch that barely moves, so scrolling and
 * long-presses don't count.
 */
export function useDoubleTap(onDoubleTap: (() => void) | undefined) {
  const start = useRef({ x: 0, y: 0, at: 0 });
  const lastTap = useRef(0);
  if (!onDoubleTap) return null;
  return {
    onTouchStart(e: any) {
      const touch = e.nativeEvent.touches?.[0] ?? e.nativeEvent;
      start.current = { x: touch.pageX, y: touch.pageY, at: Date.now() };
    },
    onTouchEnd(e: any) {
      const touch = e.nativeEvent.changedTouches?.[0] ?? e.nativeEvent;
      const now = Date.now();
      const isTap = now - start.current.at < TAP_MS
        && Math.hypot(touch.pageX - start.current.x, touch.pageY - start.current.y) < TAP_SLOP;
      if (!isTap) { lastTap.current = 0; return; }
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        onDoubleTap();
        return;
      }
      lastTap.current = now;
    },
  };
}

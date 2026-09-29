import { Platform } from 'react-native';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';

/**
 * Uncaught browser errors go to the backend (/api/client-errors), which forwards them to
 * Sentry tagged `side: web`. No Sentry SDK in the page: nothing extra for visitors to load.
 */

const SAME_ERROR_GAP_MS = 60_000;
const lastSent = new Map<string, number>();

// Browser noise that isn't ours to fix
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:|moz-extension:|safari-extension:/i];

export function reportError(error: unknown, kind = 'error') {
  if (Platform.OS !== 'web') return;
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message || String(error);
  const stack = err.stack || '';
  if (IGNORED.some((re) => re.test(message) || re.test(stack))) return;
  // The same error over and over (a render loop) is reported once a minute
  const key = `${kind}:${message}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < SAME_ERROR_GAP_MS) return;
  lastSent.set(key, now);

  const token = useAuthStore.getState().currentUser?.token;
  fetch(`${SERVER_URL}/api/client-errors`, {
    method: 'POST',
    keepalive: true, // still delivered if the page is closing
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message, stack, kind, url: location.href, ua: navigator.userAgent }),
  }).catch(() => {});
}

let installed = false;

/** Catch what nothing else caught: script errors and rejected promises nobody handled. */
export function installErrorReporting() {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'uncaught'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandled-rejection'));
}

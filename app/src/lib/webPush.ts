import { Platform } from 'react-native';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';

/** Browser notifications (web push, see webpush.py on the server and public/push-sw.js).
 *
 *  'unsupported'   not a browser that can do it (or the native app, which uses Expo push)
 *  'needs-install' iPhone / iPad Safari: only apps added to the Home Screen get push
 *  'unavailable'   the server has no push keys
 *  'denied'        blocked in the browser; only the site settings can undo that
 *  'off' / 'on'    */
export type PushStatus = 'unsupported' | 'needs-install' | 'unavailable' | 'denied' | 'off' | 'on';

const WORKER = '/push-sw.js';
const OPTED_OUT = 'pushOptedOut'; // turned off in the app: don't quietly turn it back on
const SNOOZED_UNTIL = 'pushPromptSnoozedUntil';

const isWeb = Platform.OS === 'web';

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function store(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode */ }
}

function browserCanPush() {
  return isWeb && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function isAppleMobile() {
  // iPadOS reports itself as a Mac, but a touch one
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function installed() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

let keyRequest: Promise<string | null> | null = null;
function serverKey(): Promise<string | null> {
  keyRequest ??= fetch(`${SERVER_URL}/api/push/config`)
    .then((r) => r.json())
    .then((d) => d.key ?? null)
    .catch(() => { keyRequest = null; return null; });
  return keyRequest;
}

function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
}

function authHeaders(token = useAuthStore.getState().currentUser?.token ?? '') {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!isWeb) return 'unsupported';
  if (isAppleMobile() && !installed()) return 'needs-install';
  if (!browserCanPush()) return 'unsupported';
  if (!(await serverKey())) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted' || stored(OPTED_OUT)) return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

/** Subscribe this browser for the signed-in account. */
async function subscribe(): Promise<boolean> {
  const key = await serverKey();
  if (!key) return false;
  const registration = await navigator.serviceWorker.register(WORKER);
  await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const res = await fetch(`${SERVER_URL}/api/push/subscribe`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

/** Ask the browser, then subscribe. Call it from a tap: browsers only prompt for a user gesture. */
export async function enablePush(): Promise<PushStatus> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
    store(OPTED_OUT, null);
    return (await subscribe()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Stop notifications on this browser. `optOut` false is for signing out: the next person
 *  to sign in here (with permission already granted) is subscribed again without asking. */
export async function disablePush(optOut = true) {
  if (optOut) store(OPTED_OUT, '1');
  if (!browserCanPush()) return;
  const token = useAuthStore.getState().currentUser?.token ?? ''; // read now: signing out clears it
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch(`${SERVER_URL}/api/push/unsubscribe`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe();
  } catch { /* nothing to undo */ }
}

/** After signing in: re-attach this browser to the account if notifications are allowed and on. */
export async function resumePush() {
  if (!browserCanPush() || Notification.permission !== 'granted' || stored(OPTED_OUT)) return;
  try { await subscribe(); } catch { /* try again next time */ }
}

/** The in-app "turn on notifications?" card: not again for a while once dismissed. */
export function promptSnoozed() {
  return Number(stored(SNOOZED_UNTIL) ?? 0) > Date.now();
}
export function snoozePrompt(days = 14) {
  store(SNOOZED_UNTIL, String(Date.now() + days * 86_400_000));
}
/** Asked already, or the user decided in settings: no card. */
export function promptAnswered() {
  return !isWeb || !('Notification' in window) || Notification.permission !== 'default' || !!stored(OPTED_OUT);
}

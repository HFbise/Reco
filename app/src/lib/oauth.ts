import { Platform } from 'react-native';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';

/** Sign in with GitHub / Google (see oauth.py on the server). Web only for now:
 *  the native apps would need deep links for the provider to send them back. */
export type Provider = 'github' | 'google';
export const PROVIDER_NAMES: Record<Provider, string> = { github: 'GitHub', google: 'Google' };

export const OAUTH_SUPPORTED = Platform.OS === 'web';

/** Providers the server has credentials for; [] off the web or if it can't be reached. */
export async function fetchProviders(): Promise<Provider[]> {
  if (!OAUTH_SUPPORTED) return [];
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/providers`);
    const data = await res.json();
    return (data.providers ?? []).filter((p: string): p is Provider => p in PROVIDER_NAMES);
  } catch {
    return [];
  }
}

/** Leave for the provider; it sends the browser back to /oauth. */
export function signInWith(provider: Provider) {
  window.location.assign(`${SERVER_URL}/auth/${provider}`);
}

/** Connect a provider to the signed-in account. Asked for with the session token rather
 *  than by navigating, so the account never appears in a URL. */
export async function connectProvider(provider: Provider): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/auth/${provider}/link`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${useAuthStore.getState().currentUser?.token ?? ''}` },
    });
    if (!res.ok) return false;
    window.location.assign((await res.json()).url);
    return true;
  } catch {
    return false;
  }
}

/** What the server put after '#' on the way back, removed from the address bar and history
 *  so a sign-in ticket isn't left lying around. */
export function takeReturnParams(): Record<string, string> {
  if (!OAUTH_SUPPORTED || !window.location.hash) return {};
  const params = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));
  window.history.replaceState(null, '', window.location.pathname);
  return params;
}

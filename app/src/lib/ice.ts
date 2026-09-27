import { SERVER_URL } from './config';

/** Public STUN only: works on most home networks, fails behind strict NATs. */
export const STUN_ONLY = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/** Short-lived STUN/TURN entries from our server ([] if unavailable or not signed in). */
export async function fetchIceServers(token?: string): Promise<RTCIceServer[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${SERVER_URL}/api/ice-servers`, { headers: { Authorization: `Bearer ${token}` } });
    const servers = await res.json();
    return Array.isArray(servers) ? servers : [];
  } catch {
    return [];
  }
}

/** Room voice: prefer our TURN relay, fall back to STUN so voice still works on friendly networks. */
export async function fetchIceConfig(token?: string) {
  const servers = await fetchIceServers(token);
  return servers.length ? { iceServers: servers } : STUN_ONLY;
}

/**
 * Voice with a stranger: relay ONLY. Peers then see just the TURN server's
 * address, never each other's IP. Returns null when no TURN relay is
 * configured; callers must refuse to connect rather than fall back to direct.
 */
export async function fetchRelayOnlyConfig(token?: string) {
  const turn = (await fetchIceServers(token)).filter((s) => String(s.urls).startsWith('turn'));
  return turn.length ? { iceServers: turn, iceTransportPolicy: 'relay' as const } : null;
}

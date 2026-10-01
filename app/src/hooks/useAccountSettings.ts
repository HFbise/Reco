import { useCallback, useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

export type DmFrom = 'everyone' | 'rooms' | 'nobody';

/** Settings kept with your account, the same on every device (see user_settings.py) */
export interface AccountSettings {
  /** Who may message you first */
  dm_from: DmFrom;
  /** Others see you online */
  show_online: boolean;
  push_dms: boolean;
  push_matches: boolean;
}

/** Your account's settings (null until loaded), and a way to change them. A change shows at
 *  once and the server sends the result to all your devices. Loaded while `enabled` (guests
 *  have no account; a closed settings page needn't listen). */
export function useAccountSettings(enabled = true) {
  const [settings, setSettings] = useState<AccountSettings | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    const onSettings = (data: AccountSettings) => setSettings(data);
    // Refused (a server error): show what is actually saved again
    const onFailed = () => socket.emit('get_settings', {});
    socket.on('settings', onSettings);
    socket.on('settings_result', onFailed);
    socket.emit('get_settings', {});
    return () => {
      socket.off('settings', onSettings);
      socket.off('settings_result', onFailed);
    };
  }, [enabled]);

  const change = useCallback((patch: Partial<AccountSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    getSocket().emit('update_settings', patch);
  }, []);

  return { settings, change };
}

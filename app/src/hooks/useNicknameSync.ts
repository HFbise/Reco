import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useNicknameStore } from '../store/nicknameStore';

/** Keep your nicknames for people in step with the server (every device of yours). */
export function useNicknameSync() {
  const username = useAuthStore((s) => (s.currentUser?.guest ? undefined : s.currentUser?.username));
  const setAll = useNicknameStore((s) => s.setAll);

  useEffect(() => {
    if (!username) {
      setAll({});
      return;
    }
    const socket = getSocket();
    const load = () => socket.emit('get_nicknames', {});
    const onNames = (data: { nicknames: Record<string, string> }) => setAll(data.nicknames ?? {});
    socket.on('nicknames', onNames);
    socket.on('connect', load);
    load();
    return () => {
      socket.off('nicknames', onNames);
      socket.off('connect', load);
    };
  }, [username, setAll]);
}

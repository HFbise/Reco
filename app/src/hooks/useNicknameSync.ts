import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { usePeopleStore } from '../store/peopleStore';

/** Keep your nicknames for people in step with the server (every device of yours). */
export function useNicknameSync() {
  const username = useAuthStore((s) => (s.currentUser?.guest ? undefined : s.currentUser?.username));
  const setNicknames = usePeopleStore((s) => s.setNicknames);

  useEffect(() => {
    if (!username) {
      setNicknames({});
      return;
    }
    const socket = getSocket();
    const load = () => socket.emit('get_nicknames', {});
    const onNames = (data: { nicknames: Record<string, string> }) => setNicknames(data.nicknames ?? {});
    socket.on('nicknames', onNames);
    socket.on('connect', load);
    load();
    return () => {
      socket.off('nicknames', onNames);
      socket.off('connect', load);
    };
  }, [username, setNicknames]);
}

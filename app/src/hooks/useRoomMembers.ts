import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';
import type { Member } from '../components/members/types';

// The last list seen per room: shown at once when a room is opened again, then refreshed
const cache = new Map<string, Member[]>();

/** Everyone in `room` ('' for none), with who's online kept live. Used by the members panel and
 *  by @mention suggestions. */
export function useRoomMembers(room: string) {
  const [members, setMembers] = useState<Member[]>(() => cache.get(room) ?? []);

  useEffect(() => {
    setMembers(cache.get(room) ?? []);
    if (!room) return;
    const socket = getSocket();
    // The server only answers once this socket is in the room: ask now, and again once joined
    const load = () => socket.emit('get_members', { room });
    const onJoined = (data: { success: boolean; room?: string }) => { if (data.success && data.room === room) load(); };
    load();
    const onMembersList = (data: { room: string; members: Member[] }) => {
      if (data.room !== room) return;
      cache.set(room, data.members);
      setMembers(data.members);
    };
    const onOnlineStatus = (data: { username: string; online: boolean }) => {
      setMembers((prev) => prev.map((m) => (m.username === data.username ? { ...m, is_online: data.online } : m)));
    };
    socket.on('members_list', onMembersList);
    socket.on('online_status_changed', onOnlineStatus);
    socket.on('join_result', onJoined);
    return () => {
      socket.off('join_result', onJoined);
      socket.off('members_list', onMembersList);
      socket.off('online_status_changed', onOnlineStatus);
    };
  }, [room]);

  return members;
}

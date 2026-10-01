import { useCallback, useEffect, useRef, useState } from 'react';
import { mentionsMe } from '../../lib/mentions';
import { getSocket } from '../../lib/socket';
import { playNotifSound } from '../../lib/sounds';
import { useAuthStore } from '../../store/authStore';
import { usePeopleStore } from '../../store/peopleStore';
import { usePrefsStore } from '../../store/prefsStore';
import {
  patched, withDmNotification, withDms, withLastPatched, withMessage, withOnline, withRoom, withRooms, without,
  type ChatEntry, type ServerDm, type ServerRoom,
} from './model';

// Nothing unread, nobody waiting on you
const READ = { unread: 0, mentioned: false };

/**
 * The chat list's data, kept in step with the server: the lists it sends, live messages,
 * pins and mutes, read marks, rooms joined and left. `open` is the chat on screen (read as
 * messages arrive). The logic is in ./model; this wires it to the socket.
 */
export function useChatList(open: string | null | undefined) {
  const username = useAuthStore((s) => s.currentUser?.username);
  const setBlocked = usePeopleStore((s) => s.setBlocked);
  const soundOn = usePrefsStore((s) => s.soundEnabled);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Socket handlers are set up once per sign-in; they read the latest values through these
  const latest = useRef({ open, soundOn, entries });
  latest.current = { open, soundOn, entries };
  // Chats being opened: the history they load isn't news (no sound, no unread)
  const opening = useRef(new Set<string>());

  useEffect(() => {
    if (!username) return;
    const socket = getSocket();
    const load = () => {
      socket.emit('get_rooms', {});
      socket.emit('get_dms', {});
      socket.emit('get_blocked_users', {});
    };
    const update = (fn: (prev: ChatEntry[]) => ChatEntry[]) => setEntries(fn);
    const on: Record<string, (data: any) => void> = {
      connect: load,
      rooms_list: (data: { rooms: ServerRoom[] }) => {
        setLoading(false);
        update((prev) => withRooms(prev, data.rooms, latest.current.open));
      },
      dms_list: (data: { dms: ServerDm[] }) => update((prev) => withDms(prev, data.dms, latest.current.open)),
      blocked_users_list: (data: { users: string[] }) => setBlocked(data.users),
      // Created on another device of yours
      new_room_created: (data: { room: string; has_password: boolean; owner?: string }) =>
        update((prev) => withRoom(prev, {
          name: data.room, hasPassword: data.has_password, needsPassword: data.has_password && data.owner !== username,
        })),
      join_result: (data: { success: boolean; room?: string; has_password?: boolean }) => {
        if (data.room) opening.current.delete(data.room);
        // A member now: the password isn't asked again
        if (data.success && data.room) {
          update((prev) => withRoom(prev, { name: data.room!, hasPassword: !!data.has_password, needsPassword: false }));
        }
      },
      join_dm_result: (data: { dm_room?: string }) => { if (data.dm_room) opening.current.delete(data.dm_room); },
      message: (data: any) => {
        if (!data.room || data.system || opening.current.has(data.room)) return;
        const { open: openNow, soundOn: sound, entries: now } = latest.current;
        // A muted chat stays quiet, unless the message @mentions you
        const quiet = now.find((e) => e.key === data.room)?.muted && !mentionsMe(data.meta, username);
        if (data.room !== openNow && data.username !== username && !quiet && sound) playNotifSound();
        update((prev) => withMessage(prev, data, openNow, username));
      },
      new_dm_notification: (data: any) => {
        update((prev) => withDmNotification(prev, data, latest.current.open));
        socket.emit('room_subscribe', { room: data.dm_room }); // live messages for a DM that's new here
      },
      message_edited: (data: { id: number; text: string }) =>
        update((prev) => withLastPatched(prev, data.id, { text: data.text.slice(0, 120) })),
      message_recalled: (data: { id: number }) => update((prev) => withLastPatched(prev, data.id, { recalled: true, text: '' })),
      online_status_changed: (data: { username: string; online: boolean }) =>
        update((prev) => withOnline(prev, data.username, data.online)),
      // Pins, mutes and read marks are per person: every device of yours hears about them
      chat_pref: (data: { room: string; pinned: boolean; muted: boolean }) =>
        update((prev) => patched(prev, data.room, { pinned: data.pinned, muted: data.muted })),
      chat_read: (data: { room: string }) => update((prev) => patched(prev, data.room, READ)),
      leave_room_result: (data: { success: boolean; room: string }) => {
        if (data.success) update((prev) => without(prev, data.room));
      },
      kicked_from_room: (data: { room: string }) => update((prev) => without(prev, data.room)),
      room_closed: (data: { room: string }) => update((prev) => without(prev, data.room)),
    };
    for (const [event, handler] of Object.entries(on)) socket.on(event, handler);
    load();
    return () => {
      for (const [event, handler] of Object.entries(on)) socket.off(event, handler);
    };
  }, [username, setBlocked]);

  /** About to open `key`: its history isn't news, and whatever was unread is read now. */
  const opened = useCallback((key: string) => {
    opening.current.add(key);
    setEntries((prev) => patched(prev, key, READ));
  }, []);

  const setPref = useCallback((key: string, pref: { pinned?: boolean; muted?: boolean }) => {
    setEntries((prev) => patched(prev, key, pref));
    getSocket().emit('set_chat_pref', { room: key, ...pref });
  }, []);

  const markRead = useCallback((key: string) => {
    setEntries((prev) => patched(prev, key, READ));
    getSocket().emit('mark_chat_read', { room: key });
  }, []);

  /** Hide a DM until someone writes in it again (close_dm on the server). */
  const closeDm = useCallback((key: string) => {
    setEntries((prev) => without(prev, key));
    getSocket().emit('close_dm', { dm_room: key });
  }, []);

  const addRoom = useCallback((room: { name: string; hasPassword: boolean; needsPassword?: boolean }) => {
    setEntries((prev) => withRoom(prev, room));
  }, []);

  return { entries, loading, opened, setPref, markRead, closeDm, addRoom };
}

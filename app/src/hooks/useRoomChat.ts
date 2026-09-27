import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { cacheMsg, getCached, getLastTs, patchCached, resetRoom } from '../lib/messageCache';
import { useAuthStore } from '../store/authStore';
import type { Message } from '../components/MessageBubble';
import type { VoiceMember } from './useVoice';

export interface RoomInfo {
  code: string;
  memberCount: number;
  isOwner: boolean;
  /** 2 owner, 1 room admin, 0 member */
  myLevel: number;
  hasPassword: boolean;
}

interface Options {
  /** Room name, or a DM id like "dm:alice:bob" */
  name: string;
  /** Password typed by the user when opening a protected room */
  password?: string;
  onKicked: () => void;
  onJoinFailed: (reply: any) => void;
  onToast: (kind: 'muted' | 'dm-blocked') => void;
}

const oldestId = (messages: Message[]) => messages.find((m) => typeof m.id === 'number')?.id;

/**
 * Everything a chat screen needs from the server for one room or DM: joining,
 * live messages and edits, history paging, room info, mutes and who is in
 * voice. The socket subscription only resets when the room or user changes;
 * callbacks are read through a ref so the latest ones are always used.
 */
export function useRoomChat({ name, password, onKicked, onJoinFailed, onToast }: Options) {
  const username = useAuthStore((s) => s.currentUser?.username);
  const isDm = name.startsWith('dm:');

  const [messages, setMessages] = useState<Message[]>(() => getCached(name));
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [room, setRoom] = useState<RoomInfo>({ code: '', memberCount: 0, isOwner: false, myLevel: 0, hasPassword: !!password });
  const [isTextMuted, setIsTextMuted] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<VoiceMember[]>([]);

  const callbacks = useRef({ onKicked, onJoinFailed, onToast });
  callbacks.current = { onKicked, onJoinFailed, onToast };
  const passwordRef = useRef(password);
  passwordRef.current = password;

  useEffect(() => {
    if (!username || !name) return;
    const socket = getSocket();
    const cached = getCached(name);
    setMessages(cached);
    setHasOlder(false);
    setIsTextMuted(false);
    setVoiceMembers([]);

    const join = () => {
      const current = getCached(name);
      const payload = { since: getLastTs(name), oldest_id: oldestId(current) };
      if (isDm) socket.emit('join_dm', { dm_room: name, ...payload });
      else socket.emit('join', { room: name, password: passwordRef.current ?? '', ...payload });
    };
    join();

    const mine = (data: any) => data?.room === name;
    const withOwn = (m: Message): Message => ({ ...m, isOwn: m.username === username });

    const handlers: Record<string, (data: any) => void> = {
      connect: join,
      join_result: (data) => {
        if (!mine(data)) return;
        if (!data.success) {
          callbacks.current.onJoinFailed(data);
          return;
        }
        socket.emit('get_members', { room: name });
        setHasOlder(!!data.has_older);
        setRoom((r) => ({
          ...r,
          code: data.code || '',
          memberCount: data.members?.length ?? 0,
          isOwner: !!data.is_owner,
          myLevel: data.my_level ?? 0,
          hasPassword: data.has_password ?? r.hasPassword,
        }));
      },
      join_dm_result: (data) => {
        if (data?.dm_room === name) setHasOlder(!!data.has_older);
      },
      message: (data) => {
        // The socket sits in many rooms at once (all DMs, rooms visited this session)
        if (!mine(data)) return;
        const msg = withOwn(data);
        if (!msg.system) cacheMsg(name, msg);
        // Append rather than reload the cache: older pages loaded by scrolling up live only in state
        setMessages((prev) => (msg.id != null && prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      },
      history_reset: (data) => {
        // More than a page arrived while away: the server is sending the latest page instead
        if (!mine(data)) return;
        resetRoom(name);
        setMessages([]);
      },
      older_messages: (data) => {
        if (!mine(data)) return;
        setLoadingOlder(false);
        setHasOlder(!!data.has_more);
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          return [...data.messages.filter((m: Message) => !known.has(m.id)).map(withOwn), ...prev];
        });
      },
      message_recalled: (data) => {
        if (!mine(data)) return;
        patchCached(name, data.id, { recalled: true });
        setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, recalled: true } : m)));
      },
      message_edited: (data) => {
        if (!mine(data)) return;
        patchCached(name, data.id, { text: data.text, edited: true });
        setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, text: data.text, edited: true } : m)));
      },
      reaction_updated: (data) => {
        if (!mine(data)) return;
        patchCached(name, data.id, { reactions: data.reactions });
        setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, reactions: data.reactions } : m)));
      },
      room_password_changed: (data) => {
        if (mine(data)) setRoom((r) => ({ ...r, hasPassword: data.has_password }));
      },
      text_muted_notify: () => {
        setIsTextMuted(true);
        callbacks.current.onToast('muted');
      },
      text_muted: (data) => {
        if (mine(data) && data.target === username) setIsTextMuted(true);
      },
      text_unmuted: (data) => {
        if (mine(data) && data.target === username) setIsTextMuted(false);
      },
      dm_blocked: (data) => {
        if (mine(data)) callbacks.current.onToast('dm-blocked');
      },
      kicked_from_room: (data) => {
        if (mine(data)) callbacks.current.onKicked();
      },
      // Who is in voice in THIS room (the app-wide voice session may be elsewhere)
      voice_members_view: (data) => {
        if (!data.room || mine(data)) setVoiceMembers(data.members || []);
      },
      voice_user_joined: (data) => {
        if (data.room && !mine(data)) return;
        setVoiceMembers((prev) => (prev.some((m) => m.username === data.username) ? prev : [...prev, data]));
      },
      voice_user_left: (data) => {
        if (data.room && !mine(data)) return;
        setVoiceMembers((prev) => prev.filter((m) => m.username !== data.username));
      },
      voice_speaking: (data) => {
        if (!mine(data)) return;
        setVoiceMembers((prev) => prev.map((m) => (m.username === data.username ? { ...m, isSpeaking: data.speaking } : m)));
      },
      voice_mute_status: (data) => {
        if (!mine(data)) return;
        setVoiceMembers((prev) => prev.map((m) => (m.username === data.username ? { ...m, isMuted: data.muted } : m)));
      },
    };

    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
    };
  }, [username, name, isDm]);

  const loadOlder = useCallback(() => {
    const before = oldestId(messages);
    if (!hasOlder || loadingOlder || before == null) return;
    setLoadingOlder(true);
    getSocket().emit('load_older', { room: name, before_id: before });
  }, [messages, hasOlder, loadingOlder, name]);

  const send = useCallback((text: string) => {
    const body = text.trim();
    if (body) getSocket().emit('message', { room: name, text: body });
  }, [name]);

  const recall = useCallback((id: number) => getSocket().emit('recall_message', { id }), []);
  const edit = useCallback((id: number, text: string) => {
    if (text.trim()) getSocket().emit('edit_message', { id, text: text.trim() });
  }, []);
  const react = useCallback((id: number, emoji: string) => getSocket().emit('add_reaction', { id, emoji }), []);
  const leave = useCallback(() => getSocket().emit('leave_room', { room: name }), [name]);

  /** Set (or clear, with null) the room password; resolves with the server's error text key, if any. */
  const setRoomPassword = useCallback((pw: string | null) => new Promise<any>((resolve) => {
    const socket = getSocket();
    socket.once('set_room_password_result', resolve);
    socket.emit('set_room_password', { room: name, password: pw });
  }), [name]);

  return {
    messages, hasOlder, loadingOlder, loadOlder,
    room, isTextMuted, voiceMembers,
    send, recall, edit, react, leave, setRoomPassword,
  };
}

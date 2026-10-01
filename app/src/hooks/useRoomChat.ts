import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { cacheMsg, getCached, getLastTs, patchCached, patchCachedQuotes, resetRoom } from '../lib/messageCache';

import { useAuthStore } from '../store/authStore';
import type { Message } from '../components/chat/message/types';
import type { VoiceMember } from './useVoice';

/** How much of a message a reply quotes (matches the server's history.QUOTE_LEN) */
const QUOTE_LEN = 140;

/** `m` with its quote of message `id` updated, if it quotes that message */
function patchQuote(m: Message, id: number, patch: Partial<NonNullable<Message['reply']>>): Message {
  return m.reply && m.reply.id === id ? { ...m, reply: { ...m.reply, ...patch } } : m;
}

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
  /** Removed from the room: kicked by an admin, or the owner closed it */
  onRemoved: (reason: 'kicked' | 'closed') => void;
  onJoinFailed: (reply: any) => void;
  onToast: (kind: ChatToast) => void;
}

export type ChatToast = 'muted' | 'dm-blocked' | 'rate-limited' | 'send-failed';

// Typing: send at most this often while typing; forget a typist this long after their last signal
const TYPING_SEND_MS = 2000;
// New messages seen while a chat is open are reported (at most) this often
const MARK_READ_MS = 2000;

const pageVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
const TYPING_SHOW_MS = 4000;
const STALE_TYPING_MS = 1500;

const oldestId = (messages: Message[]) => messages.find((m) => typeof m.id === 'number')?.id;

/**
 * Everything a chat screen needs from the server for one room or DM: joining,
 * live messages and edits, history paging, room info, mutes and who is in
 * voice. The socket subscription only resets when the room or user changes;
 * callbacks are read through a ref so the latest ones are always used.
 */
export function useRoomChat({ name, password, onRemoved, onJoinFailed, onToast }: Options) {
  const username = useAuthStore((s) => s.currentUser?.username);
  const isGuest = useAuthStore((s) => !!s.currentUser?.guest);
  const isDm = name.startsWith('dm:');

  const [messages, setMessages] = useState<Message[]>(() => getCached(name));
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [room, setRoom] = useState<RoomInfo>({ code: '', memberCount: 0, isOwner: false, myLevel: 0, hasPassword: !!password });
  const [isTextMuted, setIsTextMuted] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<VoiceMember[]>([]);
  // Who else is typing here: username -> display name and when to stop showing it
  const [typists, setTypists] = useState<Record<string, { screenname: string; until: number }>>({});
  const lastTypingSent = useRef(0);
  // When each person's last message arrived: a "typing" that shows up just after it is stale
  // (the server handles events on several threads, so the two can arrive out of order)
  const lastMessageAt = useRef<Record<string, number>>({});
  // Newest message id seen here but not yet reported as read
  const unreportedRead = useRef(0);

  const callbacks = useRef({ onRemoved, onJoinFailed, onToast });
  callbacks.current = { onRemoved, onJoinFailed, onToast };
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
    setTypists({});

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
        // Seen while the chat is open: read (reported in batches, and only while the page is visible)
        if (typeof msg.id === 'number' && msg.username !== username) {
          unreportedRead.current = Math.max(unreportedRead.current, msg.id);
        }
        // Their message is here: they're done typing
        lastMessageAt.current[msg.username] = Date.now();
        setTypists((t) => {
          if (!t[msg.username]) return t;
          const { [msg.username]: _done, ...rest } = t;
          return rest;
        });
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
      // Edits and recalls reach the message and every reply quoting it
      message_recalled: (data) => {
        if (!mine(data)) return;
        patchCached(name, data.id, { recalled: true });
        patchCachedQuotes(name, data.id, { recalled: true, text: '' });
        setMessages((prev) => prev.map((m) => (
          m.id === data.id ? { ...m, recalled: true } : patchQuote(m, data.id, { recalled: true, text: '' })
        )));
      },
      message_edited: (data) => {
        if (!mine(data)) return;
        const quoteText = String(data.text).slice(0, QUOTE_LEN);
        patchCached(name, data.id, { text: data.text, edited: true });
        patchCachedQuotes(name, data.id, { text: quoteText });
        setMessages((prev) => prev.map((m) => (
          m.id === data.id ? { ...m, text: data.text, edited: true } : patchQuote(m, data.id, { text: quoteText })
        )));
      },
      reaction_updated: (data) => {
        if (!mine(data)) return;
        patchCached(name, data.id, { reactions: data.reactions });
        setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, reactions: data.reactions } : m)));
      },
      typing: (data) => {
        if (!mine(data) || data.username === username) return;
        if (Date.now() - (lastMessageAt.current[data.username] ?? 0) < STALE_TYPING_MS) return;
        setTypists((t) => ({ ...t, [data.username]: { screenname: data.screenname, until: Date.now() + TYPING_SHOW_MS } }));
      },
      room_password_changed: (data) => {
        if (mine(data)) setRoom((r) => ({ ...r, hasPassword: data.has_password }));
      },
      text_muted_notify: (data) => {
        if (!mine(data)) return;
        setIsTextMuted(true);
        callbacks.current.onToast('muted');
      },
      message_rate_limited: (data) => {
        if (mine(data)) callbacks.current.onToast('rate-limited');
      },
      message_failed: (data) => {
        if (mine(data)) callbacks.current.onToast('send-failed');
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
        if (mine(data)) callbacks.current.onRemoved('kicked');
      },
      room_closed: (data) => {
        if (mine(data)) callbacks.current.onRemoved('closed');
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

  // Report reading: every couple of seconds, and right away when the page comes back into view
  useEffect(() => {
    if (!username || isGuest) return; // demo visitors have nothing to mark
    const flush = () => {
      if (!unreportedRead.current || !pageVisible()) return;
      getSocket().emit('mark_read', { room: name, id: unreportedRead.current });
      unreportedRead.current = 0;
    };
    const timer = setInterval(flush, MARK_READ_MS);
    const onVisible = () => flush();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      flush(); // leaving the chat: what was on screen has been read
    };
  }, [name, username, isGuest]);

  // Drop typists who went quiet
  const anyTypists = Object.keys(typists).length > 0;
  useEffect(() => {
    if (!anyTypists) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypists((t) => {
        const live = Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > now));
        return Object.keys(live).length === Object.keys(t).length ? t : live;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [anyTypists]);

  /** Call on every keystroke; the others hear about it at most every couple of seconds */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SEND_MS) return;
    lastTypingSent.current = now;
    getSocket().emit('typing', { room: name });
  }, [name]);

  const loadOlder = useCallback(() => {
    const before = oldestId(messages);
    if (!hasOlder || loadingOlder || before == null) return;
    setLoadingOlder(true);
    getSocket().emit('load_older', { room: name, before_id: before });
  }, [messages, hasOlder, loadingOlder, name]);

  /**
   * Send `text`, optionally as a reply to message `replyTo` and/or with an uploaded photo
   * (both checked by the server: same room, the sender's own unused upload).
   */
  const send = useCallback((text: string, replyTo?: number | null, imageId?: string) => {
    const body = text.trim();
    if (!body && !imageId) return;
    getSocket().emit('message', {
      room: name, text: body, ...(replyTo ? { reply_to: replyTo } : {}), ...(imageId ? { image: imageId } : {}),
    });
    lastTypingSent.current = 0; // the next message starts a fresh "typing" 
  }, [name]);

  const recall = useCallback((id: number) => getSocket().emit('recall_message', { id }), []);
  const edit = useCallback((id: number, text: string) => {
    if (text.trim()) getSocket().emit('edit_message', { id, text: text.trim() });
  }, []);
  const react = useCallback((id: number, emoji: string) => getSocket().emit('add_reaction', { id, emoji }), []);
  const leave = useCallback(() => getSocket().emit('leave_room', { room: name }), [name]);
  /** Owner only: delete the room for everyone */
  const close = useCallback(() => getSocket().emit('close_room', { room: name }), [name]);

  return {
    messages, hasOlder, loadingOlder, loadOlder,
    room, isTextMuted, voiceMembers,
    typing: Object.values(typists).map((v) => v.screenname),
    send, notifyTyping, recall, edit, react, leave, close,
  };
}

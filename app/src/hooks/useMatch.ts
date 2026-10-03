import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';

export type MatchMode = 'text' | 'voice';
export type MatchPhase = 'idle' | 'searching' | 'matched' | 'ended';
export type EndReason = 'partner_left' | 'you_left' | 'reported';

export interface MatchMessage {
  id: number;
  text: string;
  time: string;
  from: 'me' | 'stranger';
}

export interface Revealed {
  dm_room: string;
  username: string;
  screenname: string;
  avatar_expression: string;
  avatar_color: string;
}

interface MatchState {
  phase: MatchPhase;
  matchId: number | null;
  mode: MatchMode;
  tags: string[];
  sharedTags: string[];
  stranger: { expression: string; color: string } | null;
  /** Voice: this side sends the WebRTC offer */
  initiator: boolean;
  messages: MatchMessage[];
  strangerTyping: boolean;
  keepRequested: boolean;
  revealed: Revealed | null;
  endReason: EndReason | null;
  /** You reported this stranger (during the match or after it ended) */
  reported: boolean;
  searchingSince: number;
}

const IDLE: MatchState = {
  phase: 'idle', matchId: null, mode: 'text', tags: [], sharedTags: [], stranger: null, initiator: false,
  messages: [], strangerTyping: false, keepRequested: false, revealed: null, endReason: null, reported: false, searchingSince: 0,
};

/**
 * Client side of random matching (server: handlers/match.py). The stranger is
 * only ever "stranger": the server never sends their identity unless both
 * sides chose to keep in touch (`revealed`).
 */
export function useMatch() {
  const [state, setState] = useState<MatchState>(IDLE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const handlers: Record<string, (data: any) => void> = {
      match_waiting: () => setState((s) => ({ ...s, phase: 'searching', searchingSince: s.searchingSince || Date.now() })),
      match_cancelled: () => setState((s) => ({ ...IDLE, mode: s.mode, tags: s.tags })),
      match_found: (d) => setState((s) => ({
        ...IDLE,
        mode: d.mode,
        tags: s.tags,
        phase: 'matched',
        matchId: d.match_id,
        sharedTags: d.shared_tags ?? [],
        stranger: d.stranger,
        initiator: !!d.initiator,
      })),
      match_message: (d) => setState((s) => (s.phase === 'matched'
        ? { ...s, messages: [...s.messages, d], strangerTyping: d.from === 'stranger' ? false : s.strangerTyping }
        : s)),
      match_typing: () => {
        setState((s) => ({ ...s, strangerTyping: true }));
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setState((s) => ({ ...s, strangerTyping: false })), 3000);
      },
      match_keep_ack: () => setState((s) => ({ ...s, keepRequested: true })),
      match_revealed: (d) => setState((s) => ({ ...s, revealed: d })),
      match_reported: (d) => setState((s) => (d.match_id === s.matchId ? { ...s, reported: true } : s)),
      match_ended: (d) => setState((s) => (s.phase === 'matched'
        ? { ...s, phase: 'ended', strangerTyping: false, endReason: d.reason ?? 'partner_left' }
        : s)),
    };
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      // Leaving the screen ends whatever was going on (like closing the tab)
      if (stateRef.current.phase === 'searching') socket.emit('match_cancel', {});
      if (stateRef.current.phase === 'matched') socket.emit('match_leave', {});
    };
  }, []);

  const start = useCallback((mode: MatchMode, tags: string[]) => {
    setState({ ...IDLE, mode, tags, phase: 'searching', searchingSince: Date.now() });
    getSocket().emit('match_enqueue', { mode, tags });
  }, []);

  const cancel = useCallback(() => getSocket().emit('match_cancel', {}), []);

  const next = useCallback(() => {
    const { mode, tags } = stateRef.current;
    setState({ ...IDLE, mode, tags, phase: 'searching', searchingSince: Date.now() });
    getSocket().emit('match_next', { mode, tags });
  }, []);

  const leave = useCallback(() => {
    getSocket().emit('match_leave', {});
    setState((s) => ({ ...s, phase: 'ended', endReason: 'you_left', strangerTyping: false }));
  }, []);

  const backToStart = useCallback(() => setState((s) => ({ ...IDLE, mode: s.mode, tags: s.tags })), []);
  const send = useCallback((text: string) => {
    if (text.trim()) getSocket().emit('match_message', { text: text.trim() });
  }, []);
  const typing = useCallback(() => getSocket().emit('match_typing', {}), []);
  const keep = useCallback(() => getSocket().emit('match_keep', {}), []);
  // After the match ended too: the stranger may have left the moment they said something
  const report = useCallback((reason: string) =>
    getSocket().emit('match_report', { reason, match_id: stateRef.current.matchId }), []);

  return { ...state, start, cancel, next, leave, backToStart, send, typing, keep, report };
}

import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

/** A pinned message as the server lists it (server: pins.py) */
export interface Pin {
  id: number;
  username: string;
  screenname: string;
  text: string;
  image: boolean;
  pinned_by: string;
  pinned_at: string;
}

/** The chat's pinned messages, most recent first, kept live. Asked for once the chat is joined
 *  (the server only answers a socket that's in it), and again when a pinned message is edited. */
export function usePins(room: string) {
  const [pins, setPins] = useState<Pin[]>([]);
  useEffect(() => {
    setPins([]);
    if (!room) return;
    const socket = getSocket();
    const ask = () => socket.emit('get_pins', { room });
    let current: Pin[] = [];
    const handlers: Record<string, (data: any) => void> = {
      pins_updated: (d) => { if (d.room === room) { current = d.pins ?? []; setPins(current); } },
      join_result: (d) => { if (d.room === room && d.success) ask(); },
      join_dm_result: (d) => { if (d.dm_room === room && d.success) ask(); },
      message_edited: (d) => { if (d.room === room && current.some((p) => p.id === d.id)) ask(); },
    };
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    ask(); // already joined (the panel opened again)
    return () => { for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler); };
  }, [room]);
  return pins;
}

import { create } from 'zustand';

/** Who a card is being opened for: what's already known, shown until the server's full card arrives */
export interface CardPerson {
  username: string;
  screenname?: string;
  avatar_expression?: string;
  avatar_color?: string;
}

interface CardState {
  person: CardPerson | null;
  /** The room it was opened in (moderation, voice volume), if any */
  room: string | null;
  show: (person: CardPerson, room?: string | null) => void;
  hide: () => void;
}

/** The one person card on screen: opened from a message, a name, the member list or a header,
 *  shown by ProfileCardHost. */
export const useCardStore = create<CardState>((set) => ({
  person: null,
  room: null,
  show: (person, room = null) => set({ person, room: room && !room.startsWith('dm:') ? room : null }),
  hide: () => set({ person: null, room: null }),
}));

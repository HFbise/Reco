import { useEffect, useState, type RefObject } from 'react';
import type { MessageListHandle } from './MessageList';
import type { Message } from './message/types';

const MAX_PAGES = 20; // older pages to load looking for the message

/**
 * Show a message that may not be loaded yet (a search result): load older pages until it's
 * there, then scroll to it and flash it. `onGiveUp` when it's further back than MAX_PAGES.
 */
export function useJumpToMessage(
  chat: { messages: Message[]; hasOlder: boolean; loadingOlder: boolean; loadOlder: () => void },
  list: RefObject<MessageListHandle | null>,
  onGiveUp: () => void,
) {
  const [target, setTarget] = useState<{ id: number; pages: number } | null>(null);

  useEffect(() => {
    if (!target) return;
    if (chat.messages.some((m) => m.id === target.id)) {
      // After the list has rendered the page that brought it
      const timer = setTimeout(() => list.current?.jumpTo(target.id), 50);
      setTarget(null);
      return () => clearTimeout(timer);
    }
    if (chat.loadingOlder) return;
    if (!chat.hasOlder || target.pages >= MAX_PAGES) {
      setTarget(null);
      onGiveUp();
      return;
    }
    chat.loadOlder();
    setTarget({ ...target, pages: target.pages + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, chat.messages, chat.loadingOlder, chat.hasOlder]);

  return (id: number) => setTarget({ id, pages: 0 });
}

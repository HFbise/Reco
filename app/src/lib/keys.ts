interface Key { key?: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; isComposing?: boolean; keyCode?: number }

/** Enter without Shift (or, with `enterSends` off, Ctrl/⌘+Enter), and not confirming an
 *  input-method (IME) candidate: with pinyin and similar input methods, Enter picks the
 *  candidate, it doesn't mean "send". */
export function isSendKey(e: Key, enterSends = true) {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return false;
  return enterSends ? !e.shiftKey : !!(e.ctrlKey || e.metaKey);
}

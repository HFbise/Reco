/** Enter without Shift, and not confirming an input-method (IME) candidate: with
 *  pinyin and similar input methods, Enter picks the candidate, it doesn't mean "send". */
export function isSendKey(e: { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number }) {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}

import { useEffect, useRef, useState } from 'react';
import { canSendImages, pickImageFile, uploadImage, type UploadError, type UploadedImage } from '../../lib/images';

/**
 * Photos in a chat: pick a file or paste a screenshot (desktop) → shrink and upload → `send`
 * the upload as a message. `enabled` false (guests, the native app) turns it all off.
 */
export function usePhotoSending({ enabled, send, onError }: {
  enabled: boolean;
  send: (image: UploadedImage) => void;
  onError: (error: UploadError) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const on = enabled && canSendImages;

  async function sendFile(file: File) {
    if (uploading) return;
    setUploading(true);
    const result = await uploadImage(file);
    setUploading(false);
    if (typeof result === 'string') onError(result);
    else send(result);
  }
  // The paste listener is added once; it calls whatever sendFile is current
  const latest = useRef(sendFile);
  latest.current = sendFile;

  useEffect(() => {
    if (!on) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      latest.current(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [on]);

  return {
    uploading,
    /** The message box's photo button (undefined: none) */
    attach: on ? async () => { const file = await pickImageFile(); if (file) sendFile(file); } : undefined,
  };
}

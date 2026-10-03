import { Platform } from 'react-native';
import { SERVER_URL } from './config';
import { useAuthStore } from '../store/authStore';

/** Photos are shrunk in the browser before upload: long side at most this, as WebP (or JPEG
 *  where the browser can't write WebP). Plenty for a chat bubble and the full-size viewer. */
const MAX_SIDE = 1280;
const QUALITY = 0.8;
/** The server's limit (images.MAX_BYTES) */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface UploadedImage { id: string; width: number; height: number }
export type UploadError = 'image_too_big' | 'not_an_image' | 'rate_limited' | 'upload_failed';

export const imageUrl = (id: string) => `${SERVER_URL}/img/${id}`;

/** Photo sending is web-only for now (the native apps would need an image picker module) */
export const canSendImages = Platform.OS === 'web';

/** Open the browser's file picker for one image. Resolves null if the user cancels. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // No change event on cancel in every browser; focus coming back is the fallback
    window.addEventListener('focus', () => setTimeout(() => resolve(input.files?.[0] ?? null), 500), { once: true });
    input.click();
  });
}

/**
 * Shrink a photo to MAX_SIDE and re-encode it (which also drops EXIF, location included).
 * WebP is about a third smaller than JPEG at the same quality; Safari can't encode it and
 * hands back a PNG instead, so then it's JPEG. GIFs are sent as they are, so they keep moving.
 */
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  // Transparent PNGs get a white ground instead of turning black
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
  const webp = await encode('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('encode');
  return jpeg;
}

/** Shrink and upload one image. The result is attached to a message by sending its id. */
export async function uploadImage(file: File): Promise<UploadedImage | UploadError> {
  let body: Blob;
  try {
    body = await shrink(file);
  } catch {
    return 'not_an_image';
  }
  if (body.size > MAX_UPLOAD_BYTES) return 'image_too_big';
  try {
    const res = await fetch(`${SERVER_URL}/api/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${useAuthStore.getState().currentUser?.token ?? ''}`, 'Content-Type': body.type },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.id === 'string') return data as UploadedImage;
    const known: UploadError[] = ['image_too_big', 'not_an_image', 'rate_limited'];
    return known.includes(data.error) ? data.error : 'upload_failed';
  } catch {
    return 'upload_failed';
  }
}

/** Display size for a photo in a bubble: fits `max` on the long side, never upscaled */
export function fitImage(w: number, h: number, max = 260): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w || 1, h || 1));
  return { width: Math.max(60, Math.round(w * scale)), height: Math.max(60, Math.round(h * scale)) };
}

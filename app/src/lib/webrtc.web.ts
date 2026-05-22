// Web platform: use browser's native WebRTC APIs

export const RTCPeerConnectionImpl: typeof RTCPeerConnection | null =
  typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null;

export const RTCSessionDescriptionImpl: typeof RTCSessionDescription | null =
  typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null;

export const RTCIceCandidateImpl: typeof RTCIceCandidate | null =
  typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null;

export async function getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  return navigator.mediaDevices.getUserMedia(constraints);
}

export const isSupported = typeof RTCPeerConnection !== 'undefined';

// Per-peer audio elements for remote playback
const _audioElements: Record<string, HTMLAudioElement> = {};
let _speakerDeviceId = '';

export function setSpeakerDevice(deviceId: string): void {
  _speakerDeviceId = deviceId;
  for (const audio of Object.values(_audioElements)) {
    if (typeof (audio as any).setSinkId === 'function') {
      (audio as any).setSinkId(deviceId).catch(() => {});
    }
  }
}

export function playRemoteStream(username: string, stream: MediaStream): void {
  if (typeof document === 'undefined') return;
  let audio = _audioElements[username];
  if (!audio) {
    audio = document.createElement('audio');
    audio.autoplay = true;
    (audio as any).playsInline = true;
    document.body.appendChild(audio);
    _audioElements[username] = audio;
    if (_speakerDeviceId && typeof (audio as any).setSinkId === 'function') {
      (audio as any).setSinkId(_speakerDeviceId).catch(() => {});
    }
  }
  audio.srcObject = stream;
  audio.play().catch(() => {});
}

export function stopRemoteStream(username: string): void {
  const audio = _audioElements[username];
  if (audio) {
    audio.srcObject = null;
    try { audio.remove(); } catch {}
    delete _audioElements[username];
  }
}

export function setSpeakerVolumeAll(vol: number): void {
  for (const audio of Object.values(_audioElements)) {
    audio.volume = Math.max(0, Math.min(1, vol));
  }
}

export async function getDisplayMedia(constraints: any): Promise<MediaStream | null> {
  try { return await navigator.mediaDevices.getDisplayMedia(constraints); } catch { return null; }
}

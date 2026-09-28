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

export async function getDisplayMedia(constraints: any): Promise<MediaStream | null> {
  try { return await navigator.mediaDevices.getDisplayMedia(constraints); } catch { return null; }
}

// ── Remote audio ──────────────────────────────────────────────
//
// An <audio> element can't play louder than volume 1.0, so volumes up to 150%
// (per person and overall) go through Web Audio instead:
//
//   remote stream ─► person's gain (0–1.5) ─► master gain (speaker volume, deafen)
//        ─► limiter (a boosted loud voice would otherwise clip) ─► one output <audio> (chosen speaker)
//
// Chrome only feeds a remote WebRTC stream into Web Audio while the stream is
// also attached to a media element, so each one also plays through a muted
// <audio>. Until the AudioContext is actually running (starting it can take a
// moment, or wait for a click), streams play through plain <audio> elements
// capped at 100%, and move onto Web Audio as soon as it runs. With no Web Audio
// at all they simply stay there.

/** Top of every volume slider (speaker, microphone, per person), in percent */
export const MAX_VOLUME = 150;

type Source = { el: HTMLAudioElement; node: MediaStreamAudioSourceNode | null };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let output: HTMLAudioElement | null = null;
const gains: Record<string, GainNode> = {};
const sources: Record<string, Record<string, Source>> = {}; // username → stream id → source
const userVolume: Record<string, number> = {}; // username → percent
let masterVolume = 1;
let speakerDeviceId = '';

const running = () => !!ctx && ctx.state === 'running';

function setSink(el: HTMLAudioElement) {
  if (speakerDeviceId && typeof (el as any).setSinkId === 'function') {
    (el as any).setSinkId(speakerDeviceId).catch(() => {});
  }
}

function audioElement(stream: MediaStream, muted: boolean) {
  const el = document.createElement('audio');
  el.autoplay = true;
  (el as any).playsInline = true;
  el.muted = muted;
  el.srcObject = stream;
  document.body.appendChild(el);
  el.play().catch(() => {});
  return el;
}

/**
 * Create and start the audio pipeline. Call it straight from a click (joining
 * voice): browsers only let audio start in response to one, Safari especially.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    try {
      ctx = new AC() as AudioContext;
      master = ctx.createGain();
      master.gain.value = masterVolume;
      // Brick-wall limiter just under full scale: ordinary speech passes untouched
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      const dest = ctx.createMediaStreamDestination();
      master.connect(limiter);
      limiter.connect(dest);
      output = audioElement(dest.stream, false);
      setSink(output);
      ctx.addEventListener('statechange', () => {
        if (!running()) return;
        output?.play().catch(() => {});
        for (const username of Object.keys(sources)) upgrade(username);
        const waiting = whenRunning.splice(0);
        waiting.forEach((cb) => cb());
      });
    } catch {
      ctx = null;
      return;
    }
  }
  ctx.resume?.().catch(() => {});
  output?.play().catch(() => {});
}

/** The shared AudioContext (null before unlockAudio, or without Web Audio). */
export function audioContext(): AudioContext | null {
  return ctx;
}

const whenRunning: (() => void)[] = [];

/** Run `cb` once the AudioContext is running: now if it already is. */
export function whenAudioRunning(cb: () => void): void {
  if (running()) cb();
  else if (ctx) whenRunning.push(cb);
}

/** Move `username`'s plain-<audio> streams onto Web Audio (their volume can then pass 100%). */
function upgrade(username: string) {
  for (const src of Object.values(sources[username] ?? {})) {
    if (src.node || !src.el.srcObject) continue;
    try {
      src.node = ctx!.createMediaStreamSource(src.el.srcObject as MediaStream);
      src.node.connect(gainFor(username));
      src.el.muted = true; // still attached, so Chrome keeps pulling the stream
    } catch {
      src.node = null;
    }
  }
}

function gainFor(username: string): GainNode {
  if (!gains[username]) {
    const gain = ctx!.createGain();
    gain.gain.value = (userVolume[username] ?? 100) / 100;
    gain.connect(master!);
    gains[username] = gain;
  }
  return gains[username];
}

function applyFallbackVolume(username: string) {
  const vol = Math.min(1, ((userVolume[username] ?? 100) / 100) * masterVolume);
  for (const src of Object.values(sources[username] ?? {})) {
    if (!src.node) src.el.volume = Math.max(0, vol);
  }
}

/** Play one of `username`'s streams (their voice, or audio they share). */
export function playRemoteStream(username: string, stream: MediaStream): void {
  if (typeof document === 'undefined' || !stream) return;
  const mine = (sources[username] ??= {});
  if (mine[stream.id]) return;
  if (running()) {
    const el = audioElement(stream, true); // keeps Chrome pulling the stream; heard via Web Audio
    let node: MediaStreamAudioSourceNode | null = null;
    try {
      node = ctx!.createMediaStreamSource(stream);
      node.connect(gainFor(username));
    } catch {
      node = null;
      el.muted = false;
      setSink(el);
    }
    mine[stream.id] = { el, node };
  } else {
    const el = audioElement(stream, false);
    setSink(el);
    mine[stream.id] = { el, node: null };
  }
  applyFallbackVolume(username);
}

/** Stop everything we play for `username` (they left, or the connection closed). */
export function stopRemoteStream(username: string): void {
  for (const src of Object.values(sources[username] ?? {})) {
    try { src.node?.disconnect(); } catch {}
    src.el.srcObject = null;
    try { src.el.remove(); } catch {}
  }
  delete sources[username];
  try { gains[username]?.disconnect(); } catch {}
  delete gains[username];
}

/** One person's volume in percent, 0–MAX_VOLUME (above 100 only with Web Audio). */
export function setUserVolume(username: string, percent: number): void {
  userVolume[username] = Math.max(0, Math.min(MAX_VOLUME, percent));
  if (gains[username]) gains[username].gain.value = userVolume[username] / 100;
  applyFallbackVolume(username);
}

/** Speaker volume for everyone, 0–1.5 (0 = deafened). */
export function setSpeakerVolumeAll(vol: number): void {
  masterVolume = Math.max(0, Math.min(MAX_VOLUME / 100, vol));
  if (master) master.gain.value = masterVolume;
  for (const username of Object.keys(sources)) applyFallbackVolume(username);
}

export function setSpeakerDevice(deviceId: string): void {
  speakerDeviceId = deviceId;
  if (output) setSink(output);
  for (const byStream of Object.values(sources)) {
    for (const src of Object.values(byStream)) if (!src.node) setSink(src.el);
  }
}

// Fallback for TypeScript — Metro resolves .web.ts / .native.ts at build time.
// This file is never actually bundled; it exists only for tsc module resolution.
export {
  RTCPeerConnectionImpl,
  RTCSessionDescriptionImpl,
  RTCIceCandidateImpl,
  getUserMedia,
  isSupported,
  playRemoteStream,
  stopRemoteStream,
  setSpeakerVolumeAll,
  setSpeakerDevice,
  getDisplayMedia,
} from './webrtc.native';

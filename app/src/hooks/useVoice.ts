import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { setSpeakerDevice } from '../lib/webrtc';
import { IDLE, VoiceSession } from '../lib/voice/voiceSession';
import { useVolumeStore } from '../store/volumeStore';

export type { VoiceMember } from '../lib/voice/voiceSession';

const nothing = () => () => {};
const idle = () => IDLE;

/**
 * Voice in `room` ('' for none): who is in its channel, and joining, muting and sharing. The work
 * happens in lib/voice (VoiceSession); this hands its state to React. Switching rooms leaves the
 * old room's voice.
 */
export function useVoice(room: string) {
  const session = useMemo(() => (room ? new VoiceSession(room) : null), [room]);
  useEffect(() => session?.attach(), [session]);
  const state = useSyncExternalStore(session?.subscribe ?? nothing, session?.getState ?? idle);
  const micVolume = useVolumeStore((s) => s.mic);
  const speakerVolume = useVolumeStore((s) => s.speaker);
  // The microphone picked in settings, used the next time you join (in any room)
  const micDevice = useRef('');

  return {
    inVoice: state.inVoice,
    voiceMembers: state.members,
    isMuted: state.muted,
    isDeafened: state.deafened,
    ping: state.ping,
    micVolume,
    micGainSupported: state.micGainSupported,
    speakerVolume,
    isStreamingAudio: state.streamingAudio,
    isStreaming: state.streaming,
    remoteVideoStreams: state.remoteVideos,
    /** Your own screen while you share it (picture only) */
    localVideoStream: state.localVideo as MediaStream | null,
    joinVoice: () => session?.join(micDevice.current),
    leaveVoice: () => session?.leave(),
    toggleMute: () => session?.toggleMute(),
    toggleDeafen: () => session?.toggleDeafen(),
    setMicVolume: (v: number) => (session ? session.setMicVolume(v) : useVolumeStore.getState().setMic(v)),
    setSpeakerVolume: (v: number) => (session ? session.setSpeakerVolume(v) : useVolumeStore.getState().setSpeaker(v)),
    setMicDeviceId: (id: string) => { micDevice.current = id; },
    setSpeakerDeviceId: (id: string) => setSpeakerDevice(id),
    startStreamAudio: () => session?.shareSound(),
    stopStreamAudio: (announce = true) => session?.stopSharingSound(announce),
    startLive: () => session?.startLive(),
    stopLive: (announce = true) => session?.stopLive(announce),
    closeRemoteVideoStream: (username: string) => session?.dropRemoteVideo(username),
  };
}

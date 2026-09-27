import type { VoiceMember } from '../../hooks/useVoice';

/** The app-wide voice session, owned by a parent screen and passed down to chat panels. */
export interface ExternalVoice {
  inVoice: boolean;
  voiceMembers: VoiceMember[];
  isMuted: boolean;
  isDeafened: boolean;
  ping: number | null;
  micVolume: number;
  /** Whether micVolume actually changes what peers hear (web only) */
  micGainSupported: boolean;
  speakerVolume: number;
  isStreamingAudio: boolean;
  isStreaming: boolean;
  remoteVideoStreams: Record<string, { stream: MediaStream; screenname: string }>;
  joinVoice: () => void;
  leaveVoice: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  setMicVolume: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  startStreamAudio: () => void;
  stopStreamAudio: () => void;
  startLive: () => void;
  stopLive: () => void;
  closeRemoteVideoStream: (username: string) => void;
}

/** The other person in a DM, shown in the header. */
export interface DmMeta {
  screenname: string;
  username: string;
  avatarExpression?: string;
  avatarColor?: string;
}

import { showAlert } from '../alert';
import { fetchIceConfig } from '../ice';
import { t, type I18nKey } from '../i18n';
import { getSocket } from '../socket';
import { playVoiceJoinSound, playVoiceLeaveSound } from '../sounds';
import { getDisplayMedia, isSupported, setSpeakerVolumeAll, unlockAudio } from '../webrtc';
import { useAuthStore } from '../../store/authStore';
import { useLangStore } from '../../store/langStore';
import { useVolumeStore } from '../../store/volumeStore';
import { MicPipeline } from './micPipeline';
import { PeerMesh } from './peerMesh';

export interface VoiceMember {
  username: string;
  screenname: string;
  avatar_color?: string;
  avatar_expression?: string;
  isSpeaking?: boolean;
  isMuted?: boolean;
  isLive?: boolean;
  isStreamingAudio?: boolean;
}

export interface VoiceState {
  inVoice: boolean;
  /** Who is in the room's voice channel (seen whether or not you're in it) */
  members: VoiceMember[];
  muted: boolean;
  deafened: boolean;
  /** Round trip to the server in ms, while in voice */
  ping: number | null;
  /** Mic volume works (web, once the audio graph runs) */
  micGainSupported: boolean;
  /** Sharing a tab's or screen's sound */
  streamingAudio: boolean;
  /** Sharing a screen (video, maybe with sound) */
  streaming: boolean;
  /** Your own shared screen, picture only, to preview what the others see */
  localVideo: any | null;
  /** Screens shared by others: username → stream */
  remoteVideos: Record<string, { stream: any; screenname: string }>;
}

export const IDLE: VoiceState = {
  inVoice: false, members: [], muted: false, deafened: false, ping: null, micGainSupported: false,
  streamingAudio: false, streaming: false, localVideo: null, remoteVideos: {},
};

const PING_EVERY_MS = 3000;

const tr = (key: I18nKey) => t(useLangStore.getState().lang, key);
const me = () => useAuthStore.getState().currentUser;
const speakerLevel = () => useVolumeStore.getState().speaker / 100;

/**
 * Voice in one room, outside React: the mic (MicPipeline), the connections to everyone else
 * (PeerMesh), screen sharing, and the server's events about who's there. React reads it through
 * subscribe() / getState() (hooks/useVoice).
 *
 * attach() starts listening (the member list shows even before you join); its cleanup leaves
 * voice if you're in it.
 */
export class VoiceSession {
  private state: VoiceState = IDLE;
  private listeners = new Set<() => void>();
  private mic: MicPipeline | null = null;
  private mesh: PeerMesh | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** The screen (or tab) being shared, and the sound track sent with it */
  private display: any = null;
  private sharedSound: any = null;

  constructor(readonly room: string) {}

  // ── state for React ──

  getState = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<VoiceState> | ((s: VoiceState) => Partial<VoiceState>)) {
    this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    this.listeners.forEach((listener) => listener());
  }

  private patchMember(username: string, patch: Partial<VoiceMember>) {
    this.update((s) => ({ members: s.members.map((m) => (m.username === username ? { ...m, ...patch } : m)) }));
  }

  // ── the server's side ──

  attach() {
    const socket = getSocket();
    const here = (data: { room?: string }) => !data.room || data.room === this.room;
    const toMe = (data: { to?: string }) => data.to === me()?.username;
    const handlers: Record<string, (data: any) => void> = {
      // The channel as you see it from the room (in voice or not)
      voice_members_view: (data) => { if (here(data)) this.update({ members: data.members || [] }); },
      // You joined: everyone already there gets an offer from you
      voice_current_members: (data) => {
        this.update({ members: data.members || [] });
        if (!this.mesh) return;
        for (const m of data.members || []) if (m.username !== me()?.username) this.mesh.call(m.username);
      },
      voice_user_joined: (data) => {
        if (!here(data)) return;
        this.update((s) => ({ members: s.members.some((m) => m.username === data.username) ? s.members : [...s.members, data] }));
        // They'll offer; drop any connection left from an earlier session of theirs (a reconnect)
        if (data.username !== me()?.username) this.mesh?.close(data.username);
      },
      voice_user_left: (data) => {
        if (!here(data)) return;
        this.update((s) => ({ members: s.members.filter((m) => m.username !== data.username) }));
        this.mesh?.close(data.username);
      },
      voice_offer: (data) => { if (toMe(data) && this.state.inVoice) this.mesh?.answer(data.from, data.offer); },
      voice_answer: (data) => { if (toMe(data)) this.mesh?.answered(data.from, data.answer); },
      voice_ice: (data) => { if (toMe(data) && data.candidate) this.mesh?.candidate(data.from, data.candidate); },
      voice_speaking: (data) => { if (data.room === this.room) this.patchMember(data.username, { isSpeaking: data.speaking }); },
      voice_mute_status: (data) => { if (data.room === this.room) this.patchMember(data.username, { isMuted: data.muted }); },
      voice_banned: (data) => {
        if (!here(data) || data.target !== me()?.username || !this.state.inVoice) return;
        this.stop();
        showAlert(tr('voice-banned-title'), tr('voice-banned-msg'));
      },
      pong_check: (data) => this.update({ ping: Date.now() - data.t }),
      stream_start: (data) => this.patchMember(data.username, { isLive: true }),
      stream_stop: (data) => {
        this.patchMember(data.username, { isLive: false });
        this.dropRemoteVideo(data.username);
      },
      stream_audio_start: (data) => this.patchMember(data.username, { isStreamingAudio: true }),
      stream_audio_stop: (data) => this.patchMember(data.username, { isStreamingAudio: false }),
      // Back from a dropped connection: the server forgot us, so join again from scratch
      connect: () => {
        if (!this.state.inVoice || !this.mesh) return;
        this.mesh.closeAll();
        socket.emit('voice_join', { room: this.room });
      },
    };
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler);
    return () => {
      for (const [event, handler] of Object.entries(handlers)) socket.off(event, handler);
      if (this.state.inVoice) this.stop();
    };
  }

  // ── joining and leaving ──

  /** Call from the click itself: browsers only let audio start inside a user gesture. */
  async join(micDeviceId: string) {
    if (!isSupported) {
      showAlert(tr('voice-not-supported'), tr('voice-not-supported-msg'));
      return;
    }
    unlockAudio();
    setSpeakerVolumeAll(speakerLevel()); // start undeafened at the saved level
    try {
      const [mic, ice] = await Promise.all([
        MicPipeline.open(micDeviceId, useVolumeStore.getState().mic, {
          // The volume stage is live: send it instead of the raw mic
          processed: (stream) => {
            this.mesh?.replaceTrack(this.mic?.raw.getAudioTracks()[0], stream.getAudioTracks()[0]);
            this.update({ micGainSupported: true });
          },
          speaking: (speaking) => {
            getSocket().emit('voice_speaking', { room: this.room, speaking });
            const username = me()?.username;
            if (username) this.patchMember(username, { isSpeaking: speaking });
          },
        }),
        fetchIceConfig(me()?.token),
      ]);
      this.mic = mic;
      this.mesh = new PeerMesh(this.room, ice, () => ({ mic: mic.out, extra: this.display }), {
        video: (from, stream) => {
          const screenname = this.state.members.find((m) => m.username === from)?.screenname || from;
          this.update((s) => ({ remoteVideos: { ...s.remoteVideos, [from]: { stream, screenname } } }));
        },
        videoEnded: (from) => this.dropRemoteVideo(from),
      });
      this.update({ inVoice: true, muted: false, deafened: false, ping: null, micGainSupported: mic.adjustable });
      getSocket().emit('voice_join', { room: this.room });
      playVoiceJoinSound();
      this.pingTimer = setInterval(() => getSocket().emit('ping_check', { t: Date.now() }), PING_EVERY_MS);
    } catch (e: any) {
      showAlert(tr('voice-join-failed'), e?.message || tr('voice-mic-error'));
    }
  }

  leave() {
    playVoiceLeaveSound();
    this.stop();
  }

  /** Out of voice: sharing ended, mic released, connections closed, the server told. */
  private stop() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.stopLive(false);
    this.stopSharingSound(false);
    this.mesh?.closeAll();
    this.mic?.close();
    this.mesh = null;
    this.mic = null;
    getSocket().emit('voice_leave', { room: this.room });
    this.update({
      inVoice: false, muted: false, deafened: false, ping: null, micGainSupported: false,
      streaming: false, streamingAudio: false, localVideo: null,
    });
  }

  // ── your own audio ──

  toggleMute() {
    if (!this.mic) return;
    const muted = !this.state.muted;
    this.mic.setMuted(muted);
    this.update({ muted });
    getSocket().emit('voice_mute_status', { room: this.room, muted });
  }

  toggleDeafen() {
    const deafened = !this.state.deafened;
    this.update({ deafened });
    setSpeakerVolumeAll(deafened ? 0 : speakerLevel());
  }

  setMicVolume(volume: number) {
    useVolumeStore.getState().setMic(volume);
    this.mic?.setVolume(useVolumeStore.getState().mic);
  }

  setSpeakerVolume(volume: number) {
    useVolumeStore.getState().setSpeaker(volume);
    if (!this.state.deafened) setSpeakerVolumeAll(speakerLevel());
  }

  // ── sharing ──

  /** A tab's or screen's sound, without its picture */
  async shareSound() {
    const stream: any = await getDisplayMedia({ video: true, audio: true });
    if (!stream) return;
    const sound = stream.getAudioTracks()[0];
    if (!sound) {
      stream.getTracks().forEach((track: any) => track.stop());
      showAlert(tr('voice-join-failed'), tr('share-audio-missing'));
      return;
    }
    stream.getVideoTracks().forEach((track: any) => track.stop());
    this.display = stream;
    this.sharedSound = sound;
    this.mesh?.addTrack(sound, stream);
    this.update({ streamingAudio: true });
    getSocket().emit('stream_audio_start', { room: this.room });
    sound.onended = () => this.stopSharingSound(true);
  }

  stopSharingSound(announce = true) {
    if (!this.state.streamingAudio && !this.sharedSound) return;
    if (this.sharedSound) {
      this.mesh?.removeTracks([this.sharedSound]);
      try { this.sharedSound.stop(); } catch { /* ended */ }
      this.sharedSound = null;
    }
    // The screen itself may still be shared (stopLive handles that)
    if (this.display && !this.state.streaming) {
      this.display.getTracks().forEach((track: any) => { try { track.stop(); } catch { /* ended */ } });
      this.display = null;
    }
    this.update({ streamingAudio: false });
    if (announce) getSocket().emit('stream_audio_stop', { room: this.room });
  }

  /** A screen (or tab), with its sound if the browser shares it */
  async startLive() {
    if (this.state.streamingAudio) this.stopSharingSound(true);
    const stream: any = await getDisplayMedia({
      video: { frameRate: { ideal: 15 }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    if (!stream) return;
    const video = stream.getVideoTracks()[0];
    if (!video) { stream.getTracks().forEach((track: any) => track.stop()); return; }
    this.display = stream;
    this.sharedSound = stream.getAudioTracks()[0] || null;
    this.mesh?.addTrack(video, stream);
    if (this.sharedSound) this.mesh?.addTrack(this.sharedSound, stream);
    // The preview has no sound: you'd hear what you share twice
    this.update({ streaming: true, streamingAudio: !!this.sharedSound, localVideo: new MediaStream([video]) });
    getSocket().emit('stream_start', { room: this.room });
    video.onended = () => this.stopLive(true);
  }

  stopLive(announce = true) {
    if (!this.state.streaming && !this.display) return;
    if (this.display) {
      this.mesh?.removeTracks(this.display.getTracks());
      this.display.getTracks().forEach((track: any) => { try { track.stop(); } catch { /* ended */ } });
      this.display = null;
    }
    this.sharedSound = null;
    this.update({ streaming: false, streamingAudio: false, localVideo: null });
    if (announce) getSocket().emit('stream_stop', { room: this.room });
  }

  dropRemoteVideo(username: string) {
    this.update((s) => {
      const { [username]: _gone, ...rest } = s.remoteVideos;
      return { remoteVideos: rest };
    });
  }
}

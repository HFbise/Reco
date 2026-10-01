import { getSocket } from '../socket';
import {
  RTCIceCandidateImpl as ICE,
  RTCPeerConnectionImpl as PC,
  RTCSessionDescriptionImpl as SDP,
  playRemoteStream,
  stopRemoteStream,
} from '../webrtc';

/** A stream for a lone track that arrived without one */
function streamOf(event: any) {
  if (event.streams?.[0]) return event.streams[0];
  const stream = new (MediaStream as any)();
  stream.addTrack(event.track);
  return stream;
}

/**
 * Voice as a mesh: one WebRTC connection to each other person in the channel, carrying our mic
 * (and screen share, if any) and bringing back theirs. Signaling (offers, answers, ICE) goes
 * through the server, addressed to one person (voice_offer / voice_answer / voice_ice).
 *
 * Who calls whom: whoever joins sends offers to everyone already there (`call`); the others
 * answer (`answer`). Adding or removing a track later renegotiates on its own.
 */
export class PeerMesh {
  private peers: Record<string, any> = {};

  constructor(
    private readonly room: string,
    private readonly ice: any,
    /** What new connections carry: our mic, and any screen share running */
    private readonly outgoing: () => { mic: any; extra: any | null },
    private readonly on: {
      video: (from: string, stream: any) => void;
      videoEnded: (from: string) => void;
    },
  ) {}

  private send(event: string, to: string, payload: object) {
    getSocket().emit(event, { room: this.room, to, ...payload });
  }

  private open(user: string) {
    const pc = new (PC as any)(this.ice);
    this.peers[user] = pc;
    const { mic, extra } = this.outgoing();
    mic.getTracks().forEach((track: any) => pc.addTrack(track, mic));
    // Joining mid-share still gets the screen
    extra?.getTracks().forEach((track: any) => { if (track.readyState === 'live') pc.addTrack(track, extra); });

    pc.onicecandidate = ({ candidate }: any) => { if (candidate) this.send('voice_ice', user, { candidate }); };
    pc.ontrack = (event: any) => {
      if (event.track.kind === 'video') {
        this.on.video(user, streamOf(event));
        event.track.onended = () => this.on.videoEnded(user);
      } else {
        playRemoteStream(user, streamOf(event));
      }
    };
    // A track added or removed later (screen share): offer again, unless nothing new is being sent
    pc.onnegotiationneeded = async () => {
      const sending = (pc.getSenders?.() ?? []).filter((s: any) => s.track?.readyState === 'live').length;
      const described = ((pc.localDescription?.sdp || '').match(/a=(sendrecv|sendonly)/gm) || []).length;
      if (pc.localDescription && sending <= described) return;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        this.send('voice_offer', user, { offer: pc.localDescription });
      } catch (e) { console.warn('renegotiation failed', e); }
    };
    return pc;
  }

  async call(user: string) {
    if (!PC) return;
    const pc = this.open(user);
    try {
      await pc.setLocalDescription(await pc.createOffer({}));
      this.send('voice_offer', user, { offer: pc.localDescription });
    } catch (e) { console.warn('voice offer error', e); }
  }

  async answer(user: string, offer: any) {
    if (!PC || !SDP) return;
    let pc = this.peers[user];
    if (!pc || pc.signalingState === 'closed') pc = this.open(user);
    try {
      await pc.setRemoteDescription(new (SDP as any)(offer));
      await pc.setLocalDescription(await pc.createAnswer());
      this.send('voice_answer', user, { answer: pc.localDescription });
    } catch (e) { console.warn('voice answer error', e); }
  }

  async answered(user: string, answer: any) {
    const pc = this.peers[user];
    if (pc && SDP) { try { await pc.setRemoteDescription(new (SDP as any)(answer)); } catch { /* stale */ } }
  }

  async candidate(user: string, candidate: any) {
    const pc = this.peers[user];
    if (pc && ICE) { try { await pc.addIceCandidate(new (ICE as any)(candidate)); } catch { /* stale */ } }
  }

  close(user: string) {
    stopRemoteStream(user);
    this.peers[user]?.close();
    delete this.peers[user];
  }

  closeAll() {
    Object.keys(this.peers).forEach((user) => this.close(user));
  }

  /** Send `next` where `prev` was going, on every connection (the mic switching to its volume stage) */
  replaceTrack(prev: any, next: any) {
    for (const pc of Object.values(this.peers)) {
      pc.getSenders?.().find((s: any) => s.track === prev)?.replaceTrack(next).catch(() => {});
    }
  }

  addTrack(track: any, stream: any) {
    for (const pc of Object.values(this.peers)) { try { pc.addTrack(track, stream); } catch { /* closing */ } }
  }

  /** Stop sending these tracks to everyone */
  removeTracks(tracks: any[]) {
    for (const pc of Object.values(this.peers)) {
      for (const sender of pc.getSenders?.() ?? []) {
        if (tracks.includes(sender.track)) { try { pc.removeTrack(sender); } catch { /* closing */ } }
      }
    }
  }
}

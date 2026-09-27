import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket';
import { fetchRelayOnlyConfig } from '../lib/ice';
import { useAuthStore } from '../store/authStore';
import {
  RTCPeerConnectionImpl as PC, RTCSessionDescriptionImpl as SDP, RTCIceCandidateImpl as ICE,
  getUserMedia, isSupported, playRemoteStream, stopRemoteStream,
} from '../lib/webrtc';

export type MatchVoiceStatus = 'off' | 'connecting' | 'connected' | 'unavailable' | 'mic-denied' | 'failed';

const REMOTE_ID = 'match-stranger';

/**
 * One-to-one voice for a voice match. Always relayed through our TURN server
 * (iceTransportPolicy 'relay') so neither side learns the other's IP; with no
 * relay available it refuses rather than connecting directly.
 */
export function useMatchVoice(matchId: number | null, active: boolean, initiator: boolean) {
  const token = useAuthStore((s) => s.currentUser?.token);
  const [status, setStatus] = useState<MatchVoiceStatus>('off');
  const [muted, setMuted] = useState(false);
  const localStream = useRef<any>(null);

  useEffect(() => {
    if (!active || matchId == null) return;
    if (!isSupported || !PC) { setStatus('unavailable'); return; }
    const socket = getSocket();
    let pc: any = null;
    let closed = false;
    const pendingIce: any[] = [];

    const onSignal = async ({ type, payload }: { type: string; payload: any }) => {
      if (!pc) return;
      try {
        if (type === 'offer') {
          await pc.setRemoteDescription(new (SDP as any)(payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('match_signal', { type: 'answer', payload: pc.localDescription });
        } else if (type === 'answer') {
          await pc.setRemoteDescription(new (SDP as any)(payload));
        } else if (type === 'ice' && payload) {
          if (pc.remoteDescription) await pc.addIceCandidate(new (ICE as any)(payload));
          else pendingIce.push(payload);
        }
        if (pc.remoteDescription) {
          while (pendingIce.length) await pc.addIceCandidate(new (ICE as any)(pendingIce.shift()));
        }
      } catch {
        setStatus('failed');
      }
    };
    socket.on('match_signal', onSignal);

    (async () => {
      setStatus('connecting');
      const config = await fetchRelayOnlyConfig(token);
      if (closed) return;
      if (!config) { setStatus('unavailable'); return; }
      let stream: any;
      try {
        stream = await getUserMedia({ audio: true, video: false });
      } catch {
        stream = null;
      }
      if (closed) { stream?.getTracks().forEach((t: any) => t.stop()); return; }
      if (!stream) { setStatus('mic-denied'); return; }
      localStream.current = stream;

      pc = new (PC as any)(config);
      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
      pc.onicecandidate = ({ candidate }: any) => {
        if (candidate) socket.emit('match_signal', { type: 'ice', payload: candidate });
      };
      pc.ontrack = (event: any) => playRemoteStream(REMOTE_ID, event.streams?.[0]);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected');
        if (pc.connectionState === 'failed') setStatus('failed');
      };
      if (initiator) {
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socket.emit('match_signal', { type: 'offer', payload: pc.localDescription });
      }
    })();

    return () => {
      closed = true;
      socket.off('match_signal', onSignal);
      try { pc?.close(); } catch {}
      localStream.current?.getTracks().forEach((t: any) => t.stop());
      localStream.current = null;
      stopRemoteStream(REMOTE_ID);
      setStatus('off');
      setMuted(false);
    };
  }, [active, matchId, initiator, token]);

  function toggleMute() {
    const track = localStream.current?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  return { status, muted, toggleMute };
}

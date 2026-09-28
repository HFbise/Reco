import { useState, useEffect, useRef } from 'react';
import { showAlert } from '../lib/alert';
import { getSocket } from '../lib/socket';
import { STUN_ONLY, fetchIceConfig } from '../lib/ice';
import { useAuthStore } from '../store/authStore';
import { useLangStore } from '../store/langStore';
import { t as _t } from '../lib/i18n';
import {
  RTCPeerConnectionImpl as PC,
  RTCSessionDescriptionImpl as SDP,
  RTCIceCandidateImpl as ICE,
  getUserMedia,
  isSupported,
  playRemoteStream,
  stopRemoteStream,
  setSpeakerVolumeAll,
  setSpeakerDevice,
  getDisplayMedia,
  unlockAudio,
  audioContext,
  whenAudioRunning,
} from '../lib/webrtc';
import { playVoiceJoinSound, playVoiceLeaveSound } from '../lib/sounds';
import { useVolumeStore } from '../store/volumeStore';

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


export function useVoice(room: string) {
  const { currentUser } = useAuthStore();
  const lang = useLangStore(s => s.lang);

  const [inVoice, setInVoice] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<VoiceMember[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [ping, setPing] = useState<number | null>(null);
  const micVolume = useVolumeStore((s) => s.mic);
  const speakerVolume = useVolumeStore((s) => s.speaker);
  /** Mic volume only works where Web Audio can process the outgoing track (web) */
  const [micGainSupported, setMicGainSupported] = useState(false);
  const [isStreamingAudio, setIsStreamingAudio] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, { stream: MediaStream; screenname: string }>>({});

  // Stable refs — safe to read inside async socket handlers
  const inVoiceRef = useRef(false);
  const iceConfigRef = useRef<RTCConfiguration | any>(STUN_ONLY);
  /** What peers receive: the mic after the volume (gain) stage, or the raw mic */
  const localStreamRef = useRef<any>(null);
  const rawMicRef = useRef<any>(null);
  const micGainRef = useRef<any>(null);
  const peerConnsRef = useRef<Record<string, any>>({});
  const remoteStreamsRef = useRef<Record<string, any>>({});
  const roomRef = useRef(room);
  const userRef = useRef(currentUser);
  const langRef = useRef(lang);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micDeviceIdRef = useRef('');
  const displayStreamRef = useRef<any>(null);
  const streamAudioTrackRef = useRef<any>(null);
  const voiceMembersRef = useRef<VoiceMember[]>([]);
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Web Audio nodes of the mic pipeline (on the shared context), disconnected on leave */
  const micNodesRef = useRef<any[]>([]);

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { userRef.current = currentUser; }, [currentUser]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { voiceMembersRef.current = voiceMembers; }, [voiceMembers]);

  function T(key: Parameters<typeof _t>[1]) { return _t(langRef.current, key); }

  // ── helpers ──────────────────────────────────────────────

  function makeIceHandler(targetUsername: string) {
    return ({ candidate }: any) => {
      if (candidate) {
        getSocket().emit('voice_ice', { room: roomRef.current, to: targetUsername, candidate });
      }
    };
  }

  function makeTrackHandler(targetUsername: string) {
    return (event: any) => {
      const track = event.track;
      if (track.kind === 'video') {
        const stream = (event.streams && event.streams[0]) || (() => { const s = new (MediaStream as any)(); s.addTrack(track); return s; })();
        const screenname = voiceMembersRef.current.find(m => m.username === targetUsername)?.screenname || targetUsername;
        setRemoteVideoStreams(prev => ({ ...prev, [targetUsername]: { stream, screenname } }));
        track.onended = () => setRemoteVideoStreams(prev => { const next = { ...prev }; delete next[targetUsername]; return next; });
      } else {
        const stream = (event.streams && event.streams[0])
          ? event.streams[0]
          : (() => { const s = new (MediaStream as any)(); s.addTrack(event.track); return s; })();
        remoteStreamsRef.current[targetUsername] = stream;
        playRemoteStream(targetUsername, stream);
      }
    };
  }

  function makeNegotiationHandler(targetUsername: string, pc: any) {
    return async () => {
      const activeSenders = (pc.getSenders?.() ?? []).filter((s: any) => s.track?.readyState === 'live').length;
      const localSdp = pc.localDescription?.sdp || '';
      const sendMlines = (localSdp.match(/a=(sendrecv|sendonly)/gm) || []).length;
      if (pc.localDescription && activeSenders <= sendMlines) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        getSocket().emit('voice_offer', { room: roomRef.current, to: targetUsername, offer: pc.localDescription });
      } catch (e) { console.warn('renegotiation failed', e); }
    };
  }

  /** A connection to one peer carrying our mic, plus our screen share if one is running
   * (so someone who joins mid-share still gets it). */
  function setupPeer(targetUsername: string) {
    const pc = new (PC as any)(iceConfigRef.current);
    peerConnsRef.current[targetUsername] = pc;
    localStreamRef.current.getTracks().forEach((track: any) => pc.addTrack(track, localStreamRef.current));
    const display = displayStreamRef.current;
    if (display) {
      display.getTracks().forEach((track: any) => {
        if (track.readyState === 'live') pc.addTrack(track, display);
      });
    }
    pc.onicecandidate = makeIceHandler(targetUsername);
    pc.ontrack = makeTrackHandler(targetUsername);
    pc.onnegotiationneeded = makeNegotiationHandler(targetUsername, pc);
    return pc;
  }

  async function connectToPeer(targetUsername: string) {
    if (!PC || !localStreamRef.current) return;
    const pc = setupPeer(targetUsername);
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      getSocket().emit('voice_offer', { room: roomRef.current, to: targetUsername, offer: pc.localDescription });
    } catch (e) {
      console.warn('voice offer error', e);
    }
  }

  async function answerPeer(targetUsername: string, offerSdp: any) {
    if (!PC || !SDP || !localStreamRef.current) return;
    let pc = peerConnsRef.current[targetUsername];
    if (!pc || pc.signalingState === 'closed') pc = setupPeer(targetUsername);
    try {
      await pc.setRemoteDescription(new (SDP as any)(offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      getSocket().emit('voice_answer', { room: roomRef.current, to: targetUsername, answer: pc.localDescription });
    } catch (e) {
      console.warn('voice answer error', e);
    }
  }

  function closePeer(username: string) {
    stopRemoteStream(username);
    delete remoteStreamsRef.current[username];
    const pc = peerConnsRef.current[username];
    if (pc) { pc.close(); delete peerConnsRef.current[username]; }
  }

  /** Send the volume-adjusted mic instead of the raw one, on every open connection. */
  function switchToProcessedMic(processed: any) {
    const next = processed.getAudioTracks()[0];
    const prev = localStreamRef.current?.getAudioTracks()[0];
    if (!next || next === prev) return;
    next.enabled = prev ? prev.enabled : true; // keep the mute state
    for (const pc of Object.values(peerConnsRef.current) as any[]) {
      const sender = pc.getSenders?.().find((s: any) => s.track === prev);
      sender?.replaceTrack(next).catch(() => {});
    }
    localStreamRef.current = processed;
    setMicGainSupported(true);
  }

  function disconnectMicNodes() {
    for (const node of micNodesRef.current) { try { node.disconnect(); } catch {} }
    micNodesRef.current = [];
  }

  function stopLocalStream() {
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    rawMicRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;
    rawMicRef.current = null;
    micGainRef.current = null;
    setMicGainSupported(false);
    Object.keys(peerConnsRef.current).forEach(closePeer);
  }

  // Effects below subscribe once per room; they reach these (re-created every render) through a ref
  const actions = useRef({ connectToPeer, answerPeer, stopLocalStream, closePeer, stopLive, stopStreamAudio });
  actions.current = { connectToPeer, answerPeer, stopLocalStream, closePeer, stopLive, stopStreamAudio };

  // ── socket listeners ──────────────────────────────────────

  useEffect(() => {
    if (!room) return;
    const socket = getSocket();

    const onVoiceMembersView = (data: any) => {
      if (data.room && data.room !== roomRef.current) return;
      setVoiceMembers(data.members || []);
    };

    const onVoiceCurrentMembers = async (data: any) => {
      const members: VoiceMember[] = data.members || [];
      setVoiceMembers(members);
      if (inVoiceRef.current && localStreamRef.current) {
        for (const m of members) {
          if (m.username !== userRef.current?.username) {
            await actions.current.connectToPeer(m.username);
          }
        }
      }
    };

    const onVoiceUserJoined = async (data: VoiceMember & { room?: string }) => {
      if (data.room && data.room !== roomRef.current) return;
      setVoiceMembers(prev =>
        prev.some(m => m.username === data.username) ? prev : [...prev, data]
      );
      // They will send us an offer. Drop any connection left over from an earlier
      // session of theirs (e.g. they reconnected) so the new one starts clean.
      if (data.username !== userRef.current?.username) actions.current.closePeer(data.username);
    };

    const onVoiceUserLeft = (data: { username: string; room?: string }) => {
      if (data.room && data.room !== roomRef.current) return;
      setVoiceMembers(prev => prev.filter(m => m.username !== data.username));
      actions.current.closePeer(data.username);
    };

    const onVoiceOffer = async (data: any) => {
      if (data.to !== userRef.current?.username || !inVoiceRef.current) return;
      await actions.current.answerPeer(data.from, data.offer);
    };

    const onVoiceAnswer = async (data: any) => {
      if (data.to !== userRef.current?.username) return;
      const pc = peerConnsRef.current[data.from];
      if (pc && SDP) {
        try { await pc.setRemoteDescription(new (SDP as any)(data.answer)); } catch {}
      }
    };

    const onVoiceIce = async (data: any) => {
      if (data.to !== userRef.current?.username || !data.candidate) return;
      const pc = peerConnsRef.current[data.from];
      if (pc && ICE) {
        try { await pc.addIceCandidate(new (ICE as any)(data.candidate)); } catch {}
      }
    };

    const onVoiceSpeaking = (data: { username: string; speaking: boolean; room: string }) => {
      if (data.room !== roomRef.current) return;
      setVoiceMembers(prev =>
        prev.map(m => m.username === data.username ? { ...m, isSpeaking: data.speaking } : m)
      );
    };

    const onVoiceMuteStatus = (data: { username: string; muted: boolean; room: string }) => {
      if (data.room !== roomRef.current) return;
      setVoiceMembers(prev =>
        prev.map(m => m.username === data.username ? { ...m, isMuted: data.muted } : m)
      );
    };

    const onVoiceBanned = (data: { target: string; room?: string }) => {
      if (data.room && data.room !== roomRef.current) return;
      if (data.target === userRef.current?.username && inVoiceRef.current) {
        actions.current.stopLocalStream();
        inVoiceRef.current = false;
        setInVoice(false);
        setIsMuted(false);
        showAlert(T('voice-banned-title'), T('voice-banned-msg'));
      }
    };

    const onPongCheck = (data: { t: number }) => {
      setPing(Date.now() - data.t);
    };

    const onStreamStart = (data: { username: string; screenname: string }) => {
      setVoiceMembers(prev => prev.map(m => m.username === data.username ? { ...m, isLive: true } : m));
    };
    const onStreamStop = (data: { username: string }) => {
      setVoiceMembers(prev => prev.map(m => m.username === data.username ? { ...m, isLive: false } : m));
      setRemoteVideoStreams(prev => { const next = { ...prev }; delete next[data.username]; return next; });
    };
    const onStreamAudioStart = (data: { username: string }) => {
      setVoiceMembers(prev => prev.map(m => m.username === data.username ? { ...m, isStreamingAudio: true } : m));
    };
    const onStreamAudioStop = (data: { username: string }) => {
      setVoiceMembers(prev => prev.map(m => m.username === data.username ? { ...m, isStreamingAudio: false } : m));
    };

    // Reconnect: re-join voice after socket reconnects
    const onConnect = () => {
      if (inVoiceRef.current && userRef.current && roomRef.current) {
        Object.keys(peerConnsRef.current).forEach(actions.current.closePeer);
        socket.emit('voice_join', { room: roomRef.current });
      }
    };

    socket.on('connect', onConnect);
    socket.on('voice_members_view', onVoiceMembersView);
    socket.on('voice_current_members', onVoiceCurrentMembers);
    socket.on('voice_user_joined', onVoiceUserJoined);
    socket.on('voice_user_left', onVoiceUserLeft);
    socket.on('voice_offer', onVoiceOffer);
    socket.on('voice_answer', onVoiceAnswer);
    socket.on('voice_ice', onVoiceIce);
    socket.on('voice_speaking', onVoiceSpeaking);
    socket.on('voice_mute_status', onVoiceMuteStatus);
    socket.on('voice_banned', onVoiceBanned);
    socket.on('pong_check', onPongCheck);
    socket.on('stream_start', onStreamStart);
    socket.on('stream_stop', onStreamStop);
    socket.on('stream_audio_start', onStreamAudioStart);
    socket.on('stream_audio_stop', onStreamAudioStop);

    return () => {
      socket.off('connect', onConnect);
      socket.off('voice_members_view', onVoiceMembersView);
      socket.off('voice_current_members', onVoiceCurrentMembers);
      socket.off('voice_user_joined', onVoiceUserJoined);
      socket.off('voice_user_left', onVoiceUserLeft);
      socket.off('voice_offer', onVoiceOffer);
      socket.off('voice_answer', onVoiceAnswer);
      socket.off('voice_ice', onVoiceIce);
      socket.off('voice_speaking', onVoiceSpeaking);
      socket.off('voice_mute_status', onVoiceMuteStatus);
      socket.off('voice_banned', onVoiceBanned);
      socket.off('pong_check', onPongCheck);
      socket.off('stream_start', onStreamStart);
      socket.off('stream_stop', onStreamStop);
      socket.off('stream_audio_start', onStreamAudioStart);
      socket.off('stream_audio_stop', onStreamAudioStop);
    };
  }, [room]);

  // Leave voice when navigating away from room
  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      if (speakIntervalRef.current) { clearInterval(speakIntervalRef.current); speakIntervalRef.current = null; }
      disconnectMicNodes();
      if (inVoiceRef.current) {
        actions.current.stopLive(false);
        actions.current.stopStreamAudio(false);
        actions.current.stopLocalStream();
        getSocket().emit('voice_leave', { room: roomRef.current });
        inVoiceRef.current = false;
      }
    };
  }, [room]);

  // ── public actions ────────────────────────────────────────

  async function joinVoice() {
    if (!isSupported) {
      showAlert(T('voice-not-supported'), T('voice-not-supported-msg'));
      return;
    }
    // Still inside the click: the only moment browsers let audio playback start
    unlockAudio();
    // Start undeafened at the saved level (leaving voice while deafened left it at 0)
    setSpeakerVolumeAll(useVolumeStore.getState().speaker / 100);
    try {
      const audioConstraints: any = micDeviceIdRef.current
        ? { deviceId: { ideal: micDeviceIdRef.current } }
        : true;
      const [stream, iceConfig] = await Promise.all([
        getUserMedia({ audio: audioConstraints, video: false }),
        fetchIceConfig(currentUser?.token),
      ]);
      if (!stream) throw new Error(T('voice-stream-error'));
      iceConfigRef.current = iceConfig;
      rawMicRef.current = stream;
      localStreamRef.current = stream;
      inVoiceRef.current = true;
      setInVoice(true);
      setIsMuted(false);
      setIsDeafened(false);
      setPing(null);
      // Web Audio (web only): mic volume and speaking detection, on the shared context.
      // Peers get the raw mic at first; once the context runs (it may take a moment)
      // they're switched to the volume-adjusted track. Sending that track earlier
      // would send silence while the context is still suspended.
      const actx: any = audioContext();
      let src: any = null;
      if (actx?.createMediaStreamDestination) {
        try {
          src = actx.createMediaStreamSource(stream);
          const gain = actx.createGain();
          gain.gain.value = useVolumeStore.getState().mic / 100;
          // A mic boosted past 100% would clip for everyone: limit just under full scale
          const limiter = actx.createDynamicsCompressor();
          limiter.threshold.value = -1;
          limiter.knee.value = 0;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.002;
          limiter.release.value = 0.1;
          const dest = actx.createMediaStreamDestination();
          src.connect(gain);
          gain.connect(limiter);
          limiter.connect(dest);
          micGainRef.current = gain;
          micNodesRef.current = [src, gain, limiter];
          whenAudioRunning(() => {
            if (rawMicRef.current === stream) switchToProcessedMic(dest.stream);
          });
        } catch {
          src = null;
        }
      }

      getSocket().emit('voice_join', { room });
      playVoiceJoinSound();

      if (actx && src) {
        try {
          const analyser = actx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          const freqData = new Uint8Array(analyser.frequencyBinCount);
          let wasSpeaking = false;
          speakIntervalRef.current = setInterval(() => {
            if (!inVoiceRef.current) return;
            analyser.getByteFrequencyData(freqData);
            const avg = freqData.reduce((a: number, b: number) => a + b, 0) / freqData.length;
            const nowSpeaking = avg > 10;
            if (nowSpeaking !== wasSpeaking) {
              wasSpeaking = nowSpeaking;
              getSocket().emit('voice_speaking', { room: roomRef.current, speaking: nowSpeaking });
              setVoiceMembers(prev => prev.map(m =>
                m.username === userRef.current?.username ? { ...m, isSpeaking: nowSpeaking } : m
              ));
            }
          }, 100);
        } catch {}
      }

      pingIntervalRef.current = setInterval(() => {
        getSocket().emit('ping_check', { t: Date.now() });
      }, 3000);
    } catch (e: any) {
      showAlert(T('voice-join-failed'), e?.message || T('voice-mic-error'));
    }
  }

  function leaveVoice() {
    playVoiceLeaveSound();
    if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
    if (speakIntervalRef.current) { clearInterval(speakIntervalRef.current); speakIntervalRef.current = null; }
    disconnectMicNodes();
    stopLive(false);
    stopStreamAudio(false);
    stopLocalStream();
    getSocket().emit('voice_leave', { room });
    inVoiceRef.current = false;
    setInVoice(false);
    setIsMuted(false);
    setIsDeafened(false);
    setPing(null);
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    const next = !isMuted;
    // The raw mic too: speaking detection listens to it, and it feeds the volume stage
    for (const stream of [localStreamRef.current, rawMicRef.current]) {
      stream?.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
    }
    setIsMuted(next);
    getSocket().emit('voice_mute_status', { room, muted: next });
  }

  function toggleDeafen() {
    const next = !isDeafened;
    setIsDeafened(next);
    setSpeakerVolumeAll(next ? 0 : useVolumeStore.getState().speaker / 100);
  }

  function setMicVolume(v: number) {
    useVolumeStore.getState().setMic(v);
    if (micGainRef.current) micGainRef.current.gain.value = useVolumeStore.getState().mic / 100;
  }

  function setSpeakerVolume(v: number) {
    useVolumeStore.getState().setSpeaker(v);
    if (!isDeafened) setSpeakerVolumeAll(useVolumeStore.getState().speaker / 100);
  }

  function setMicDeviceId(id: string) {
    micDeviceIdRef.current = id;
  }

  function setSpeakerDeviceId(id: string) {
    setSpeakerDevice(id);
  }

  async function startStreamAudio() {
    const stream = await getDisplayMedia({ video: true, audio: true });
    if (!stream) return;
    const audioTracks = (stream as any).getAudioTracks();
    if (!audioTracks.length) {
      (stream as any).getTracks().forEach((t: any) => t.stop());
      showAlert(T('voice-join-failed'), T('share-audio-missing'));
      return;
    }
    (stream as any).getVideoTracks().forEach((t: any) => t.stop());
    displayStreamRef.current = stream;
    streamAudioTrackRef.current = audioTracks[0];
    setIsStreamingAudio(true);
    for (const pc of Object.values(peerConnsRef.current) as any[]) {
      try { pc.addTrack(streamAudioTrackRef.current, stream); } catch {}
    }
    getSocket().emit('stream_audio_start', { room });
    (streamAudioTrackRef.current as any).onended = () => stopStreamAudio(true);
  }

  function stopStreamAudio(emit = true) {
    if (!isStreamingAudio && !streamAudioTrackRef.current) return;
    if (streamAudioTrackRef.current) {
      for (const pc of Object.values(peerConnsRef.current) as any[]) {
        const sender = pc.getSenders?.()?.find((s: any) => s.track === streamAudioTrackRef.current);
        if (sender) try { pc.removeTrack(sender); } catch {}
      }
      try { (streamAudioTrackRef.current as any).stop(); } catch {}
      streamAudioTrackRef.current = null;
    }
    if (displayStreamRef.current && !isStreaming) {
      (displayStreamRef.current as any).getTracks().forEach((t: any) => { try { t.stop(); } catch {} });
      displayStreamRef.current = null;
    }
    setIsStreamingAudio(false);
    if (emit) getSocket().emit('stream_audio_stop', { room });
  }

  async function startLive() {
    if (isStreamingAudio) stopStreamAudio(true);
    const stream = await getDisplayMedia({
      video: { frameRate: { ideal: 15 }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    if (!stream) return;
    const videoTrack = (stream as any).getVideoTracks()[0];
    if (!videoTrack) { (stream as any).getTracks().forEach((t: any) => t.stop()); return; }
    displayStreamRef.current = stream;
    streamAudioTrackRef.current = (stream as any).getAudioTracks()[0] || null;
    setIsStreaming(true);
    if (streamAudioTrackRef.current) setIsStreamingAudio(true);
    for (const pc of Object.values(peerConnsRef.current) as any[]) {
      try { pc.addTrack(videoTrack, stream); } catch {}
      if (streamAudioTrackRef.current) try { pc.addTrack(streamAudioTrackRef.current, stream); } catch {}
    }
    getSocket().emit('stream_start', { room });
    (videoTrack as any).onended = () => stopLive(true);
  }

  function stopLive(emit = true) {
    if (!isStreaming && !displayStreamRef.current) return;
    if (displayStreamRef.current) {
      for (const pc of Object.values(peerConnsRef.current) as any[]) {
        (pc.getSenders?.() ?? []).forEach((sender: any) => {
          if ((displayStreamRef.current as any)?.getTracks().includes(sender.track)) {
            try { pc.removeTrack(sender); } catch {}
          }
        });
      }
      (displayStreamRef.current as any).getTracks().forEach((t: any) => { try { t.stop(); } catch {} });
      displayStreamRef.current = null;
    }
    streamAudioTrackRef.current = null;
    setIsStreaming(false);
    setIsStreamingAudio(false);
    if (emit) getSocket().emit('stream_stop', { room });
  }

  function closeRemoteVideoStream(username: string) {
    setRemoteVideoStreams(prev => { const next = { ...prev }; delete next[username]; return next; });
  }

  return {
    inVoice, voiceMembers, isMuted, isDeafened, ping,
    micVolume, micGainSupported, speakerVolume,
    isStreamingAudio, isStreaming,
    remoteVideoStreams,
    joinVoice, leaveVoice, toggleMute, toggleDeafen,
    setMicVolume, setSpeakerVolume,
    setMicDeviceId, setSpeakerDeviceId,
    startStreamAudio, stopStreamAudio,
    startLive, stopLive,
    closeRemoteVideoStream,
  };
}

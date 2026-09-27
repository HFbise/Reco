import { useState, useEffect, useRef } from 'react';
import { showAlert } from '../lib/alert';
import { getSocket } from '../lib/socket';
import { SERVER_URL } from '../lib/config';
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
} from '../lib/webrtc';
import { playVoiceJoinSound, playVoiceLeaveSound } from '../lib/sounds';

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

// Fallback when TURN credentials can't be fetched: STUN only (fails behind strict NATs)
const STUN_ONLY = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/** Short-lived TURN credentials from our server, so voice works across restrictive networks. */
async function fetchIceConfig(token?: string) {
  if (!token) return STUN_ONLY;
  try {
    const res = await fetch(`${SERVER_URL}/api/ice-servers`, { headers: { Authorization: `Bearer ${token}` } });
    const servers = await res.json();
    return Array.isArray(servers) && servers.length ? { iceServers: servers } : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  }
}

export function useVoice(room: string) {
  const { currentUser } = useAuthStore();
  const lang = useLangStore(s => s.lang);

  const [inVoice, setInVoice] = useState(false);
  const [voiceMembers, setVoiceMembers] = useState<VoiceMember[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [ping, setPing] = useState<number | null>(null);
  const [micVolume, setMicVolumeState] = useState(100);
  const [speakerVolume, setSpeakerVolumeState] = useState(100);
  const [isStreamingAudio, setIsStreamingAudio] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState<Record<string, { stream: MediaStream; screenname: string }>>({});

  // Stable refs — safe to read inside async socket handlers
  const inVoiceRef = useRef(false);
  const iceConfigRef = useRef<RTCConfiguration | any>(STUN_ONLY);
  const localStreamRef = useRef<any>(null);
  const peerConnsRef = useRef<Record<string, any>>({});
  const remoteStreamsRef = useRef<Record<string, any>>({});
  const roomRef = useRef(room);
  const userRef = useRef(currentUser);
  const langRef = useRef(lang);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakerVolumeRef = useRef(100);
  const micDeviceIdRef = useRef('');
  const displayStreamRef = useRef<any>(null);
  const streamAudioTrackRef = useRef<any>(null);
  const voiceMembersRef = useRef<VoiceMember[]>([]);
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakAudioCtxRef = useRef<any>(null);

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { userRef.current = currentUser; }, [currentUser]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { voiceMembersRef.current = voiceMembers; }, [voiceMembers]);

  function T(key: Parameters<typeof _t>[1]) { return _t(langRef.current, key); }

  // ── helpers ──────────────────────────────────────────────

  function makeIceHandler(targetUsername: string) {
    return ({ candidate }: any) => {
      if (candidate) {
        getSocket().emit('voice_ice', {
          room: roomRef.current,
          from: userRef.current?.username,
          to: targetUsername,
          candidate,
        });
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
        getSocket().emit('voice_offer', { room: roomRef.current, from: userRef.current?.username, to: targetUsername, offer: pc.localDescription });
      } catch (e) { console.warn('renegotiation failed', e); }
    };
  }

  async function connectToPeer(targetUsername: string) {
    if (!PC || !localStreamRef.current) return;
    const pc = new (PC as any)(iceConfigRef.current);
    peerConnsRef.current[targetUsername] = pc;
    localStreamRef.current.getTracks().forEach((track: any) => {
      pc.addTrack(track, localStreamRef.current);
    });
    pc.onicecandidate = makeIceHandler(targetUsername);
    pc.ontrack = makeTrackHandler(targetUsername);
    pc.onnegotiationneeded = makeNegotiationHandler(targetUsername, pc);
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      getSocket().emit('voice_offer', {
        room: roomRef.current,
        from: userRef.current?.username,
        to: targetUsername,
        offer: pc.localDescription,
      });
    } catch (e) {
      console.warn('voice offer error', e);
    }
  }

  async function answerPeer(targetUsername: string, offerSdp: any) {
    if (!PC || !SDP || !localStreamRef.current) return;
    let pc = peerConnsRef.current[targetUsername];
    if (!pc || pc.signalingState === 'closed') {
      pc = new (PC as any)(iceConfigRef.current);
      peerConnsRef.current[targetUsername] = pc;
      localStreamRef.current.getTracks().forEach((track: any) => {
        pc.addTrack(track, localStreamRef.current);
      });
      pc.onicecandidate = makeIceHandler(targetUsername);
      pc.ontrack = makeTrackHandler(targetUsername);
      pc.onnegotiationneeded = makeNegotiationHandler(targetUsername, pc);
    }
    await pc.setRemoteDescription(new (SDP as any)(offerSdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket().emit('voice_answer', {
      room: roomRef.current,
      from: userRef.current?.username,
      to: targetUsername,
      answer: pc.localDescription,
    });
  }

  function closePeer(username: string) {
    stopRemoteStream(username);
    delete remoteStreamsRef.current[username];
    const pc = peerConnsRef.current[username];
    if (pc) { pc.close(); delete peerConnsRef.current[username]; }
  }

  function stopLocalStream() {
    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    localStreamRef.current = null;
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
      if (inVoiceRef.current && data.username !== userRef.current?.username && localStreamRef.current) {
        await actions.current.connectToPeer(data.username);
      }
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
        socket.emit('voice_join', {
          username: userRef.current.username,
          screenname: userRef.current.screenname,
          room: roomRef.current,
          avatar_color: userRef.current.avatar_color || '',
        });
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
      try { speakAudioCtxRef.current?.close(); } catch {}
      speakAudioCtxRef.current = null;
      if (inVoiceRef.current) {
        actions.current.stopLive(false);
        actions.current.stopStreamAudio(false);
        actions.current.stopLocalStream();
        getSocket().emit('voice_leave', {
          username: userRef.current?.username,
          room: roomRef.current,
        });
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
      localStreamRef.current = stream;
      inVoiceRef.current = true;
      setInVoice(true);
      setIsMuted(false);
      setIsDeafened(false);
      setPing(null);
      getSocket().emit('voice_join', {
        username: currentUser?.username,
        screenname: currentUser?.screenname,
        room,
        avatar_color: currentUser?.avatar_color || '',
      });
      playVoiceJoinSound();

      // Speaking detection via Web Audio API (web only)
      const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (AC && stream) {
        try {
          const actx = new AC();
          speakAudioCtxRef.current = actx;
          const src = actx.createMediaStreamSource(stream);
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
              getSocket().emit('voice_speaking', {
                room: roomRef.current,
                username: userRef.current?.username,
                speaking: nowSpeaking,
              });
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
    try { speakAudioCtxRef.current?.close(); } catch {}
    speakAudioCtxRef.current = null;
    stopLive(false);
    stopStreamAudio(false);
    stopLocalStream();
    getSocket().emit('voice_leave', { username: currentUser?.username, room });
    inVoiceRef.current = false;
    setInVoice(false);
    setIsMuted(false);
    setIsDeafened(false);
    setPing(null);
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    const next = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
    setIsMuted(next);
    getSocket().emit('voice_mute_status', { room, username: currentUser?.username, muted: next });
  }

  function toggleDeafen() {
    const next = !isDeafened;
    setIsDeafened(next);
    setSpeakerVolumeAll(next ? 0 : speakerVolumeRef.current / 100);
  }

  function setMicVolume(v: number) {
    setMicVolumeState(v);
    // Mic gain requires Web Audio API; tracks enabled/disabled via toggleMute
  }

  function setSpeakerVolume(v: number) {
    speakerVolumeRef.current = v;
    setSpeakerVolumeState(v);
    if (!isDeafened) setSpeakerVolumeAll(v / 100);
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
    getSocket().emit('stream_audio_start', { room, username: currentUser?.username });
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
    if (emit) getSocket().emit('stream_audio_stop', { room, username: currentUser?.username });
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
    getSocket().emit('stream_start', { room, username: currentUser?.username, screenname: currentUser?.screenname });
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
    if (emit) getSocket().emit('stream_stop', { room, username: currentUser?.username });
  }

  function closeRemoteVideoStream(username: string) {
    setRemoteVideoStreams(prev => { const next = { ...prev }; delete next[username]; return next; });
  }

  return {
    inVoice, voiceMembers, isMuted, isDeafened, ping,
    micVolume, speakerVolume,
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

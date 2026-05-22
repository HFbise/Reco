import React, { createContext, useContext, useRef, useState } from 'react';
import { useVoice } from '../hooks/useVoice';

type VoiceHook = ReturnType<typeof useVoice>;

interface Ctx {
  voice: VoiceHook;
  setRoom: (room: string) => void;
  voiceRoom: string;
  leaveAndSwitchRoom: (room: string) => void;
}

const VoiceContext = createContext<Ctx | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [voiceRoom, setVoiceRoom] = useState('');
  const voice = useVoice(voiceRoom);
  const inVoiceRef = useRef(false);
  inVoiceRef.current = voice.inVoice;

  function setRoom(room: string) {
    if (!inVoiceRef.current) setVoiceRoom(room);
  }

  function leaveAndSwitchRoom(room: string) {
    voice.leaveVoice();
    setVoiceRoom(room);
  }

  return (
    <VoiceContext.Provider value={{ voice, setRoom, voiceRoom, leaveAndSwitchRoom }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useMobileVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useMobileVoice must be used within VoiceProvider');
  return ctx;
}

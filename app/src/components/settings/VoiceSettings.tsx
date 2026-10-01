import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { Group } from './parts';
import { MAX_VOLUME } from '../../lib/webrtc';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { useVoice } from '../../hooks/useVoice';
import { Fonts, Radius } from '../../theme';

type Voice = ReturnType<typeof useVoice>;
interface AudioDevice { deviceId: string; label: string; kind: string }

const canPickSpeaker = Platform.OS === 'web'
  && typeof (globalThis as any).HTMLAudioElement !== 'undefined'
  && typeof (globalThis as any).HTMLAudioElement.prototype.setSinkId === 'function';

/** Re-apply the microphone / speaker the user picked last time (web). */
export function useSavedAudioDevices(voice: Voice) {
  const [mic, setMic] = useState('');
  const [speaker, setSpeaker] = useState('');
  // useVoice's setters are recreated every render: read the latest through a ref, restore once
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  useEffect(() => {
    AsyncStorage.multiGet(['micDeviceId', 'speakerDeviceId']).then(([[, savedMic], [, savedSpeaker]]) => {
      if (savedMic) { setMic(savedMic); voiceRef.current.setMicDeviceId(savedMic); }
      if (savedSpeaker) { setSpeaker(savedSpeaker); voiceRef.current.setSpeakerDeviceId(savedSpeaker); }
    }).catch(() => {});
  }, []);
  return {
    mic,
    speaker,
    chooseMic: (id: string) => {
      setMic(id);
      voice.setMicDeviceId(id);
      AsyncStorage.setItem('micDeviceId', id).catch(() => {});
    },
    chooseSpeaker: (id: string) => {
      setSpeaker(id);
      voice.setSpeakerDeviceId(id);
      AsyncStorage.setItem('speakerDeviceId', id).catch(() => {});
    },
  };
}

/** Voice on the web: how loud you are and what you hear, and which microphone and speaker. */
export function VoiceSettings({ voice, devices }: { voice: Voice; devices: ReturnType<typeof useSavedAudioDevices> }) {
  const c = useColors();
  const t = useT();
  const [available, setAvailable] = useState<AudioDevice[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((all) => setAvailable(all
      .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || (d.kind === 'audioinput' ? `Microphone ${i + 1}` : `Speaker ${i + 1}`),
        kind: d.kind,
      })))).catch(() => {});
  }, []);

  const slider = (label: string, value: number, onChange: (v: number) => void) => (
    <View style={s.volume}>
      <View style={s.volumeHead}>
        <Text style={[s.label, { color: c.text }]}>{label}</Text>
        <Text style={[s.value, { color: value > 100 ? c.accent : c.text }]}>{Math.round(value)}%</Text>
      </View>
      <Slider style={{ width: '100%', height: 28 }} minimumValue={0} maximumValue={MAX_VOLUME} step={1} value={value}
        onValueChange={onChange} minimumTrackTintColor={c.accent} maximumTrackTintColor={c.border} thumbTintColor={c.accent}
        accessibilityLabel={label} />
    </View>
  );

  // Native <select> on the web: react-native has no dropdown primitive
  const select = (label: string, value: string, options: AudioDevice[], onChange: (id: string) => void) => (
    <View style={s.device}>
      <Text style={[s.label, { color: c.text }]}>{label}</Text>
      {React.createElement(
        'select',
        {
          value,
          'aria-label': label,
          onChange: (e: any) => onChange(e.target.value),
          style: {
            width: '100%', height: 44, padding: '0 12px', borderRadius: Radius.md, fontSize: 15, cursor: 'pointer', outline: 'none',
            // A raw <select> gets no share of the app's font rule (it has no dir attribute)
            fontFamily: "Nunito, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif", fontWeight: 600,
            backgroundColor: c.surface, color: c.text, border: `1.5px solid ${c.border}`,
          },
        },
        options.map((d) => React.createElement('option', { key: d.deviceId, value: d.deviceId }, d.label)),
      )}
    </View>
  );
  const mics = available.filter((d) => d.kind === 'audioinput');
  const speakers = available.filter((d) => d.kind === 'audiooutput');

  // Volumes are applied with Web Audio, which the native app doesn't have
  if (Platform.OS !== 'web') return null;
  return (
    <>
      <Group title={t('settings-volume')}>
        {slider(t('settings-mic-label'), voice.micVolume, voice.setMicVolume)}
        {slider(t('settings-speaker-label'), voice.speakerVolume, voice.setSpeakerVolume)}
      </Group>
      {(mics.length > 0 || (canPickSpeaker && speakers.length > 0)) && (
        <Group title={t('settings-devices')}>
          {mics.length > 0 && select(t('settings-mic-label'), devices.mic, mics, devices.chooseMic)}
          {canPickSpeaker && speakers.length > 0 && select(t('settings-speaker-label'), devices.speaker, speakers, devices.chooseSpeaker)}
        </Group>
      )}
    </>
  );
}

const s = StyleSheet.create({
  volume: { paddingVertical: 12, gap: 4 },
  volumeHead: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1, fontSize: 15, fontWeight: String(Fonts.bold) as any },
  value: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  device: { paddingVertical: 12, gap: 8 },
});

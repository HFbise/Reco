import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Switch, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useThemeStore } from '../store/themeStore';
import { useLangStore } from '../store/langStore';
import type { useVoice } from '../hooks/useVoice';
import { Fonts, Radius, Spacing } from '../theme';

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

interface Props {
  visible: boolean;
  onClose: () => void;
  voice: Voice;
  devices: ReturnType<typeof useSavedAudioDevices>;
}

/** Desktop settings: theme, language, and voice levels / devices. */
export function SettingsModal({ visible, onClose, voice, devices }: Props) {
  const c = useColors();
  const t = useT();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { lang, setLang } = useLangStore();
  const [tab, setTab] = useState<'general' | 'audio'>('general');
  const [available, setAvailable] = useState<AudioDevice[]>([]);

  async function listDevices() {
    if (Platform.OS !== 'web' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setAvailable(all
        .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || (d.kind === 'audioinput' ? `Microphone ${i + 1}` : `Speaker ${i + 1}`),
          kind: d.kind,
        })));
    } catch {}
  }

  const tabButton = (key: 'general' | 'audio', label: string) => (
    <TouchableOpacity style={[s.tab, tab === key && { borderBottomColor: c.accent }]} activeOpacity={0.8}
      onPress={() => { setTab(key); if (key === 'audio') listDevices(); }}>
      <Text style={[s.tabText, { color: tab === key ? c.accent : c.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );

  const langButton = (value: 'zh' | 'en', label: string) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => setLang(value)}
      style={[s.langBtn, { borderColor: c.border }, lang === value && { backgroundColor: c.accent, borderColor: c.accent }]}>
      <Text style={{ color: lang === value ? '#fff' : c.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );

  const slider = (value: number, onChange: (v: number) => void) => (
    <View style={s.sliderRow}>
      <Slider style={{ flex: 1, height: 32 }} minimumValue={0} maximumValue={100} step={1} value={value}
        onValueChange={onChange} minimumTrackTintColor={c.accent} maximumTrackTintColor={c.border} />
      <Text style={[s.sliderVal, { color: c.textMuted }]}>{Math.round(value)}%</Text>
    </View>
  );

  // Native <select> on the web: react-native has no dropdown primitive
  const select = (value: string, options: AudioDevice[], onChange: (id: string) => void) => React.createElement(
    'select',
    {
      value,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 14, marginTop: 4, cursor: 'pointer', outline: 'none',
        backgroundColor: c.isDark ? '#2a2b2f' : '#f0f0f3', color: c.text, border: `1px solid ${c.border}`,
      },
    },
    options.map((d) => React.createElement('option', { key: d.deviceId, value: d.deviceId }, d.label)),
  );
  const mics = available.filter((d) => d.kind === 'audioinput');
  const speakers = available.filter((d) => d.kind === 'audiooutput');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.box, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <Text style={[s.title, { color: c.text }]}>{t('settings')}</Text>
          <View style={s.tabs}>
            {tabButton('general', t('tab-general'))}
            {tabButton('audio', t('tab-audio'))}
          </View>

          {tab === 'general' ? (
            <View style={s.panel}>
              <View style={s.row}>
                <Text style={[s.label, { color: c.text }]}>{t('dark-mode')}</Text>
                <Switch value={isDark} onValueChange={toggleTheme} thumbColor="#fff" trackColor={{ false: '#ccc', true: c.accent }} />
              </View>
              <View style={s.row}>
                <Text style={[s.label, { color: c.text }]}>{t('language')}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {langButton('zh', '中文')}
                  {langButton('en', 'EN')}
                </View>
              </View>
            </View>
          ) : (
            <View style={s.panel}>
              {/* Mic volume is applied with Web Audio, which the native app doesn't have */}
              {Platform.OS === 'web' && (
                <>
                  <Text style={[s.label, { color: c.text }]}>{t('settings-mic-label')}</Text>
                  {slider(voice.micVolume, voice.setMicVolume)}
                </>
              )}
              <Text style={[s.label, { color: c.text, marginTop: 12 }]}>{t('settings-speaker-label')}</Text>
              {slider(voice.speakerVolume, voice.setSpeakerVolume)}
              {Platform.OS === 'web' && mics.length > 0 && (
                <View style={{ gap: 4, marginTop: 8 }}>
                  <Text style={[s.label, { color: c.textMuted, fontSize: 12 }]}>{t('settings-mic-label')}</Text>
                  {select(devices.mic, mics, devices.chooseMic)}
                </View>
              )}
              {canPickSpeaker && speakers.length > 0 && (
                <View style={{ gap: 4, marginTop: 8 }}>
                  <Text style={[s.label, { color: c.textMuted, fontSize: 12 }]}>{t('settings-speaker-label')}</Text>
                  {select(devices.speaker, speakers, devices.chooseSpeaker)}
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={[s.closeBtn, { backgroundColor: c.accent }]} onPress={onClose}>
            <Text style={s.closeText}>{t('close')}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  box: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, width: 380 },
  title: { fontSize: 17, fontWeight: String(Fonts.bold) as any },
  tabs: { flexDirection: 'row', gap: Spacing.lg },
  tab: { paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  panel: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  label: { fontSize: 14 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.md, borderWidth: 1 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderVal: { width: 40, fontSize: 12, textAlign: 'right' },
  closeBtn: { borderRadius: Radius.md, padding: 10, alignItems: 'center', marginTop: 4 },
  closeText: { color: '#fff', fontWeight: String(Fonts.semibold) as any },
});

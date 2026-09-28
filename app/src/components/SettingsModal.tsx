import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Switch, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { MAX_VOLUME } from '../lib/webrtc';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useThemeStore } from '../store/themeStore';
import { useLangStore } from '../store/langStore';
import type { useVoice } from '../hooks/useVoice';
import { Button } from './ui/Button';
import { DisplayText } from './ui/DisplayText';
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

  const tabButton = (key: 'general' | 'audio', label: string) => {
    const on = tab === key;
    return (
      <TouchableOpacity style={[s.tab, on && s.tabOn, on && { backgroundColor: c.surface }]} activeOpacity={0.8}
        accessibilityRole="tab" accessibilityState={{ selected: on }}
        onPress={() => { setTab(key); if (key === 'audio') listDevices(); }}>
        <Text style={[s.tabText, { color: on ? c.text : c.textSub }, on && s.heavy]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const langButton = (value: 'zh' | 'en', label: string) => {
    const on = lang === value;
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={() => setLang(value)}
        accessibilityRole="radio" accessibilityState={{ checked: on }}
        style={[s.langBtn, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accentBg : c.surface }]}>
        <Text style={[s.langText, { color: on ? c.accentText : c.textSub }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const slider = (label: string, value: number, onChange: (v: number) => void) => (
    <View style={[s.volume, { backgroundColor: c.surface2 }]}>
      <View style={s.volumeHead}>
        <Text style={[s.label, { color: c.text }]}>{label}</Text>
        <Text style={[s.sliderVal, { color: value > 100 ? c.accent : c.text }]}>{Math.round(value)}%</Text>
      </View>
      <Slider style={{ width: '100%', height: 28 }} minimumValue={0} maximumValue={MAX_VOLUME} step={1} value={value}
        onValueChange={onChange} minimumTrackTintColor={c.accent} maximumTrackTintColor={c.border} thumbTintColor={c.accent}
        accessibilityLabel={label} />
    </View>
  );

  // Native <select> on the web: react-native has no dropdown primitive
  const select = (value: string, options: AudioDevice[], onChange: (id: string) => void) => React.createElement(
    'select',
    {
      value,
      onChange: (e: any) => onChange(e.target.value),
      style: {
        width: '100%', height: 44, padding: '0 12px', borderRadius: Radius.md, fontSize: 15, cursor: 'pointer', outline: 'none',
        // A raw <select> gets no share of the app's font rule (it has no dir attribute)
        fontFamily: "Nunito, 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif", fontWeight: 600, backgroundColor: c.surface2, color: c.text, border: `1.5px solid ${c.border}`,
      },
    },
    options.map((d) => React.createElement('option', { key: d.deviceId, value: d.deviceId }, d.label)),
  );
  const mics = available.filter((d) => d.kind === 'audioinput');
  const speakers = available.filter((d) => d.kind === 'audiooutput');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={[s.overlay, { backgroundColor: c.overlay }]} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={[s.box, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
          <DisplayText style={[s.title, { color: c.text }]}>{t('settings')}</DisplayText>
          <View style={[s.tabs, { backgroundColor: c.surface2 }]} accessibilityRole="tablist">
            {tabButton('general', t('tab-general'))}
            {tabButton('audio', t('tab-audio'))}
          </View>

          {tab === 'general' ? (
            <View style={s.panel}>
              <View style={s.row}>
                <Text style={[s.label, { color: c.text }]}>{t('dark-mode')}</Text>
                <Switch value={isDark} onValueChange={toggleTheme} thumbColor={c.onAccent}
                  trackColor={{ false: c.border, true: c.accent }} {...({ activeThumbColor: c.onAccent } as any)} />
              </View>
              <View style={s.row}>
                <Text style={[s.label, { color: c.text }]}>{t('language')}</Text>
                <View style={s.langs} accessibilityRole="radiogroup">
                  {langButton('zh', '中文')}
                  {langButton('en', 'EN')}
                </View>
              </View>
            </View>
          ) : (
            <View style={s.panel}>
              {/* Volumes are applied with Web Audio, which the native app doesn't have */}
              {Platform.OS === 'web' && (
                <>
                  {slider(t('settings-mic-label'), voice.micVolume, voice.setMicVolume)}
                  {slider(t('settings-speaker-label'), voice.speakerVolume, voice.setSpeakerVolume)}
                </>
              )}
              {Platform.OS === 'web' && mics.length > 0 && (
                <View style={s.device}>
                  <Text style={[s.caption, { color: c.textSub }]}>{t('settings-mic-label')}</Text>
                  {select(devices.mic, mics, devices.chooseMic)}
                </View>
              )}
              {canPickSpeaker && speakers.length > 0 && (
                <View style={s.device}>
                  <Text style={[s.caption, { color: c.textSub }]}>{t('settings-speaker-label')}</Text>
                  {select(devices.speaker, speakers, devices.chooseSpeaker)}
                </View>
              )}
            </View>
          )}

          <Button label={t('close')} variant="quiet" onPress={onClose} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Anchored near the top, not centered: the device lists load a moment after the
  // audio tab opens, and a centered dialog would jump (sliders moving under the pointer)
  overlay: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 96, paddingHorizontal: Spacing.lg },
  box: { borderRadius: Radius.xxl, padding: Spacing.xxl, gap: Spacing.lg, width: '100%', maxWidth: 420 },
  title: { fontSize: 24 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: Radius.full },
  tab: { flex: 1, height: 38, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  tabOn: { shadowColor: '#161A23', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  heavy: { fontWeight: String(Fonts.heavy) as any },
  panel: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  label: { flex: 1, fontSize: 15, fontWeight: String(Fonts.bold) as any },
  caption: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  langs: { flexDirection: 'row', gap: 8 },
  langBtn: { height: 36, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, justifyContent: 'center' },
  langText: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  volume: { borderRadius: 18, paddingVertical: 12, paddingHorizontal: Spacing.lg, gap: 4 },
  volumeHead: { flexDirection: 'row', alignItems: 'center' },
  sliderVal: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  device: { gap: 6 },
});

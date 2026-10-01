import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { AppearanceSettings } from './AppearanceSettings';
import { ChatSettings } from './ChatSettings';
import { NotificationSettings } from './NotificationSettings';
import { PrivacySettings } from './PrivacySettings';
import { VoiceSettings, type useSavedAudioDevices } from './VoiceSettings';
import { IconBell, IconChat, IconHeadphones, IconLock, IconSun } from '../Icon';
import type { useAccountSettings } from '../../hooks/useAccountSettings';
import type { useVoice } from '../../hooks/useVoice';
import type { I18nKey } from '../../lib/i18n';

export type SectionId = 'notifications' | 'privacy' | 'chat' | 'appearance' | 'voice';

export const SECTIONS: { id: SectionId; title: I18nKey; icon: (color: string) => ReactNode; account?: boolean }[] = [
  { id: 'notifications', title: 'settings-notifications', icon: (c) => <IconBell size={18} color={c} />, account: true },
  { id: 'privacy', title: 'settings-privacy', icon: (c) => <IconLock size={17} color={c} />, account: true },
  { id: 'chat', title: 'settings-chat', icon: (c) => <IconChat size={18} color={c} /> },
  { id: 'appearance', title: 'settings-appearance', icon: (c) => <IconSun size={18} color={c} /> },
  { id: 'voice', title: 'settings-voice', icon: (c) => <IconHeadphones size={18} color={c} /> },
];

/** The sections this person sees: guests have no account settings, phones' apps no voice levels. */
export function sectionsFor(guest: boolean) {
  return SECTIONS.filter((sec) => !(guest && sec.account) && !(sec.id === 'voice' && Platform.OS !== 'web'));
}

export interface SectionDeps {
  account: ReturnType<typeof useAccountSettings>;
  voice: ReturnType<typeof useVoice>;
  devices: ReturnType<typeof useSavedAudioDevices>;
}

export function SectionContent({ id, account, voice, devices }: { id: SectionId } & SectionDeps) {
  switch (id) {
    case 'notifications': return <NotificationSettings account={account} />;
    case 'privacy': return <PrivacySettings account={account} />;
    case 'chat': return <ChatSettings />;
    case 'appearance': return <AppearanceSettings />;
    case 'voice': return <VoiceSettings voice={voice} devices={devices} />;
  }
}

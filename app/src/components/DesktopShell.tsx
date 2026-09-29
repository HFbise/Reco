import { useRef, useState } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useVoice } from '../hooks/useVoice';
import { NavRail, type Section } from './NavRail';
import { RoomsPanel, type DmEntry, type RoomsPanelHandle } from './RoomsPanel';
import { Welcome } from './Welcome';
import { ChatPanel } from './ChatPanel';
import { MembersPanel } from './MembersPanel';
import { StreamPanel } from './StreamPanel';
import { ConnectionBanner } from './ConnectionBanner';
import { ProfileView } from './account/ProfileView';
import { MatchView } from './match/MatchView';
import { SettingsModal, useSavedAudioDevices } from './SettingsModal';
import type { DmMeta } from './chat/types';
import { DisplayText } from './ui/DisplayText';
import { HEADER_HEIGHT, Spacing } from '../theme';

const dmIdWith = (me: string, other: string) => `dm:${[me, other].sort().join(':')}`;

/** Wide-screen layout: nav rail | rooms & DMs | chat (or profile) | members & voice. */
export function DesktopShell() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const c = useColors();
  const t = useT();

  // /me opens on the profile (e.g. back from connecting GitHub or Google)
  const pathname = usePathname();
  const [section, setSection] = useState<Section>(pathname === '/me' ? 'me' : 'chats');
  const [room, setRoom] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState<string | undefined>();
  const [dmMeta, setDmMeta] = useState<DmMeta | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const roomsPanel = useRef<RoomsPanelHandle>(null);
  const isGuest = !!currentUser?.guest;

  // Voice follows the open room; DMs have no voice
  const voice = useVoice(room && !room.startsWith('dm:') ? room : '');
  const audioDevices = useSavedAudioDevices(voice);

  function openRoom(name: string, password?: string) {
    setRoom(name);
    setRoomPassword(password);
    setDmMeta(null);
    setSection('chats');
  }

  function openDm(dmRoom: string, meta: DmMeta) {
    setRoom(dmRoom);
    setDmMeta(meta);
    setSection('chats');
  }

  const closeRoom = () => setRoom(null);
  const showChat = section === 'chats' && room;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
      <ConnectionBanner />
      <View style={s.shell}>
        <NavRail active={section} onSelect={setSection} onOpenSettings={() => setShowSettings(true)} showMatch />

        {section === 'chats' && (
          <View style={[s.sidebar, { backgroundColor: c.surface, borderRightColor: c.border }]}>
            <RoomsPanel
              ref={roomsPanel}
              onRoomSelect={openRoom}
              onDmSelect={(dm: DmEntry) => openDm(dm.dm_room, {
                screenname: dm.other_screenname,
                username: dm.other_username,
                avatarExpression: dm.avatar_expression,
                avatarColor: dm.avatar_color,
              })}
              onDmClose={(dmRoom) => { if (room === dmRoom) closeRoom(); }}
              selectedRoom={room}
              showSidebarHeader
            />
          </View>
        )}

        <View style={s.main}>
          {section === 'me' && (
            <View style={[s.page, { backgroundColor: c.bg }]}>
              <View style={[s.pageHeader, { borderBottomColor: c.border }]}>
                <DisplayText style={[s.pageTitle, { color: c.text }]}>{t('my-profile')}</DisplayText>
              </View>
              <ProfileView />
            </View>
          )}

          {section === 'match' && (
            <MatchView onOpenDm={(r) => openDm(r.dm_room, {
              screenname: r.screenname,
              username: r.username,
              avatarExpression: r.avatar_expression,
              avatarColor: r.avatar_color,
            })} />
          )}

          {section === 'chats' && !room && (
            <Welcome
              onJoin={isGuest ? undefined : () => roomsPanel.current?.openDropdown()}
              onMatch={() => setSection('match')}
            />
          )}

          {showChat && Object.keys(voice.remoteVideoStreams).length > 0 && (
            <StreamPanel streams={voice.remoteVideoStreams} onClose={voice.closeRemoteVideoStream} />
          )}
          {showChat && (
            <ChatPanel
              key={room}
              name={room}
              password={roomPassword}
              dmMeta={dmMeta}
              externalVoice={null}
              onClose={closeRoom}
              onNavigateToRoom={(name) => openRoom(name)}
            />
          )}
        </View>

        {showChat && !room.startsWith('dm:') && (
          <MembersPanel
            room={room}
            voice={voice}
            currentUsername={currentUser?.username}
            onOpenDm={(username, screenname, avatarExpression, avatarColor) =>
              openDm(dmIdWith(currentUser?.username ?? '', username), { screenname, username, avatarExpression, avatarColor })}
          />
        )}
      </View>

      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} voice={voice} devices={audioDevices} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 300, borderRightWidth: StyleSheet.hairlineWidth },
  main: { flex: 1 },
  page: { flex: 1 },
  pageHeader: { height: HEADER_HEIGHT, justifyContent: 'center', paddingHorizontal: Spacing.xl, borderBottomWidth: 1 },
  pageTitle: { fontSize: 20 },
});

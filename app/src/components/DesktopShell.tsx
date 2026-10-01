import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useVoice } from '../hooks/useVoice';
import { NavRail, type Section } from './NavRail';
import { ChatList, type ChatListHandle } from './chatList/ChatList';
import { Welcome } from './Welcome';
import { ChatPanel } from './chat/ChatPanel';
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
  const chatList = useRef<ChatListHandle>(null);
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

  /** Go to an app address: '/room/<name>?otherUsername=..' (a chat), '/match' or '/me'.
   *  Returns false for anything else. */
  function openPath(path: string): boolean {
    const url = new URL(path, 'https://reco.invalid');
    const chat = url.pathname.match(/^\/room\/(.+)$/);
    if (chat) {
      let name = chat[1];
      try { name = decodeURIComponent(name); } catch { /* already plain */ }
      if (name.startsWith('dm:')) {
        const q = url.searchParams;
        const other = q.get('otherUsername') || name.split(':').slice(1).find((u) => u !== currentUser?.username) || '';
        openDm(name, {
          username: other,
          screenname: q.get('displayName') || other,
          avatarExpression: q.get('avatarExpression') || undefined,
          avatarColor: q.get('avatarColor') || undefined,
        });
      } else {
        openRoom(name);
      }
      return true;
    }
    if (url.pathname === '/match' || url.pathname === '/me') {
      setSection(url.pathname === '/match' ? 'match' : 'me');
      return true;
    }
    return false;
  }

  // A notification clicked while Reco is open (see usePushNotifications.web). Navigating would
  // remount this whole layout, so the desktop takes the request itself; a new window starts
  // at the address instead (below).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onOpen = (event: Event) => {
      if (openPath((event as CustomEvent<string>).detail)) event.preventDefault();
    };
    window.addEventListener('reco-open', onOpen);
    return () => window.removeEventListener('reco-open', onOpen);
  });
  useEffect(() => {
    if (Platform.OS === 'web') openPath(window.location.pathname + window.location.search);
    // Once, for the address the window opened at
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeRoom = () => setRoom(null);
  const showChat = section === 'chats' && room;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.bg }]}>
      <ConnectionBanner />
      <View style={s.shell}>
        <NavRail active={section} onSelect={setSection} onOpenSettings={() => setShowSettings(true)} showMatch />

        {section === 'chats' && (
          <View style={[s.sidebar, { backgroundColor: c.surface, borderRightColor: c.border }]}>
            <ChatList
              ref={chatList}
              selected={room}
              onOpenRoom={openRoom}
              onOpenDm={openDm}
              onDmClosed={(key) => { if (room === key) closeRoom(); }}
              sidebarHeader
            />
          </View>
        )}

        <View style={s.main}>
          {section === 'me' && (
            <View style={[s.page, { backgroundColor: c.bg }]}>
              <View style={[s.pageHeader, { borderBottomColor: c.border }]}>
                <DisplayText style={[s.pageTitle, { color: c.text }]}>{t('my-profile')}</DisplayText>
              </View>
              <ProfileView onOpenSettings={() => setShowSettings(true)} />
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
              onJoin={isGuest ? undefined : () => chatList.current?.openNewChatMenu()}
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

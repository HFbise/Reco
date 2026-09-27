import { useRef, useState } from 'react';
import { View, Image, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing, Platform, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../src/hooks/useColors';
import { useMobileVoice } from '../../src/context/VoiceContext';
import { RoomsPanel, type RoomsPanelHandle, type DmEntry } from '../../src/components/RoomsPanel';
import { ChatPanel, type DmMeta } from '../../src/components/ChatPanel';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { AvatarView } from '../../src/components/AvatarView';
import { IconMic, IconPlus, IconChevronLeft, IconGroup, IconInfo } from '../../src/components/Icon';
import { ConnectionBanner } from '../../src/components/ConnectionBanner';

const IS_WEB = Platform.OS === 'web';
// CSS ease: cubic-bezier(0.25, 0.1, 0.25, 1.0)
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1.0);

export default function RoomsScreen() {
  const { width: SW } = useWindowDimensions();
  const c = useColors();
  const { voice, setRoom, voiceRoom, leaveAndSwitchRoom } = useMobileVoice();
  const { inVoice, voiceMembers } = voice;
  const roomsPanelRef = useRef<RoomsPanelHandle>(null);
  const plusBtnRef = useRef<View>(null);

  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [activeRoomPw, setActiveRoomPw] = useState<string | undefined>(undefined);
  const [activeDmMeta, setActiveDmMeta] = useState<DmMeta | null>(null);
  // Web: 0 = rooms visible, -SW = chat visible
  const slideAnim = useRef(new Animated.Value(0)).current;
  // Trigger ChatPanel modals from topbar (web chat view)
  const [membersKey, setMembersKey] = useState(0);
  const [infoKey, setInfoKey] = useState(0);

  const pillUser = voiceMembers.find(m => m.isSpeaking) ?? voiceMembers[0];

  function slideIn() {
    Animated.timing(slideAnim, { toValue: -SW, duration: 280, easing: EASE, useNativeDriver: true }).start();
  }

  function slideOut(cb: () => void) {
    Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: EASE, useNativeDriver: true }).start(cb);
  }

  function openRoom(name: string, password?: string) {
    if (!name.startsWith('dm:')) setRoom(name);
    if (IS_WEB) {
      const wasOpen = !!activeRoom;
      setMembersKey(0);
      setInfoKey(0);
      setActiveRoom(name);
      setActiveRoomPw(password);
      setActiveDmMeta(null);
      if (!wasOpen) slideIn();
    } else {
      router.push({ pathname: '/(main)/room/[name]', params: { name, ...(password ? { password } : {}) } });
    }
  }

  function openDm(dm: DmEntry) {
    if (IS_WEB) {
      const wasOpen = !!activeRoom;
      setMembersKey(0);
      setInfoKey(0);
      setActiveRoom(dm.dm_room);
      setActiveRoomPw(undefined);
      setActiveDmMeta({
        screenname: dm.other_screenname,
        username: dm.other_username,
        avatarExpression: dm.avatar_expression,
        avatarColor: dm.avatar_color,
      });
      if (!wasOpen) slideIn();
    } else {
      router.push({
        pathname: '/(main)/room/[name]',
        params: {
          name: dm.dm_room,
          displayName: dm.other_screenname,
          otherUsername: dm.other_username,
          ...(dm.avatar_expression ? { avatarExpression: dm.avatar_expression } : {}),
          ...(dm.avatar_color ? { avatarColor: dm.avatar_color } : {}),
        },
      });
    }
  }

  function closeRoom() {
    slideOut(() => {
      setActiveRoom(null);
      setActiveDmMeta(null);
    });
  }

  function handlePlusPress() {
    plusBtnRef.current?.measure((_fx, _fy, w, h, px, py) => {
      const sw = Dimensions.get('window').width;
      roomsPanelRef.current?.openDropdown({ top: py + h + 4, right: sw - px - w });
    });
  }

  const isActiveDm = activeRoom?.startsWith('dm:') ?? false;
  // Shared voice pill used in both topbar states
  const voicePill = inVoice && voiceRoom ? (
    <TouchableOpacity
      style={[s.pill, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)' }]}
      onPress={() => {
        if (activeRoom === voiceRoom) {
          setMembersKey(k => k + 1);
        } else {
          openRoom(voiceRoom);
          setMembersKey(1);
        }
      }}
      activeOpacity={0.75}
    >
      <IconMic size={13} color={c.accent} />
      {pillUser && (
        <View style={[s.pillAvatarRing, pillUser.isSpeaking && { borderColor: '#3ba55c' }]}>
          <AvatarView username={pillUser.username} screenname={pillUser.screenname} color={pillUser.avatar_color} size={18} />
        </View>
      )}
      <Text style={[s.pillCount, { color: c.accent }]}>({voiceMembers.length})</Text>
    </TouchableOpacity>
  ) : null;

  // Web chat view: back + room name + voice pill + info/members buttons
  // Web rooms / native: logo + spacer + voice pill + plus
  const topbar = IS_WEB && activeRoom ? (
    <View style={[s.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <TouchableOpacity style={s.plusBtn} onPress={closeRoom} activeOpacity={0.7}>
        <IconChevronLeft size={20} color={c.accent} />
      </TouchableOpacity>
      {isActiveDm ? (
        <View style={s.chatTitle}>
          {activeDmMeta && (
            <AvatarView username={activeDmMeta.username} screenname={activeDmMeta.screenname}
              color={activeDmMeta.avatarColor} expression={activeDmMeta.avatarExpression} size={22} />
          )}
          <Text style={[s.chatTitleText, { color: c.text }]} numberOfLines={1}>
            {activeDmMeta?.screenname ?? activeRoom}
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={s.chatTitle} onPress={() => setInfoKey(k => k + 1)} activeOpacity={0.7}>
          <IconGroup size={16} color={c.text} />
          <Text style={[s.chatTitleText, { color: c.text }]} numberOfLines={1}>{activeRoom}</Text>
          <IconInfo size={13} color={c.textMuted} />
        </TouchableOpacity>
      )}
      {voicePill}
      {!isActiveDm && (
        <TouchableOpacity style={s.plusBtn} onPress={() => setMembersKey(k => k + 1)} activeOpacity={0.7}>
          <IconGroup size={20} color={c.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  ) : (
    <View style={[s.topbar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
      <Image source={require('../../assets/reco-logo.png')} style={s.logo} tintColor={c.isDark ? '#fff' : undefined} resizeMode="contain" />
      <View style={{ flex: 1 }} />
      {voicePill}
      <TouchableOpacity ref={plusBtnRef} style={s.plusBtn} onPress={handlePlusPress} activeOpacity={0.7}>
        <IconPlus size={20} color={c.accent} />
      </TouchableOpacity>
    </View>
  );

  if (IS_WEB) {
    // Web: side-by-side panels, both slide together (matches old CSS transition)
    return (
      <SafeAreaView style={[s.root, { backgroundColor: c.surface }]} edges={['top', 'left', 'right']}>
        <ConnectionBanner />
        {topbar}
        <View style={s.slideViewport}>
          <Animated.View style={[s.slideTrack, { width: SW * 2, transform: [{ translateX: slideAnim }] }]}>
            {/* Left panel: Rooms */}
            <View style={[s.slidePanel, { width: SW, backgroundColor: c.surface }]}>
              <RoomsPanel
                ref={roomsPanelRef}
                onRoomSelect={openRoom}
                onDmSelect={openDm}
                onDmClose={(dmRoom) => { if (activeRoom === dmRoom) closeRoom(); }}
              />
              <BottomTabBar />
            </View>
            {/* Right panel: Chat */}
            <View style={[s.slidePanel, { width: SW, backgroundColor: c.bg }]}>
              {activeRoom && (
                <ChatPanel
                  key={activeRoom}
                  name={activeRoom}
                  password={activeRoomPw}
                  dmMeta={activeDmMeta}
                  hideHeader
                  hideVoiceBar
                  externalVoice={activeDmMeta ? null : voice}
                  onClose={closeRoom}
                  activeVoiceRoom={activeDmMeta ? undefined : voiceRoom || undefined}
                  onLeaveAndSwitch={activeDmMeta ? undefined : leaveAndSwitchRoom}
                  onNavigateToRoom={openRoom}
                  membersKey={membersKey}
                  infoKey={infoKey}
                />
              )}
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  // Native: standard layout, router.push handles navigation with platform animation
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.surface }]} edges={['top', 'left', 'right']}>
      <ConnectionBanner />
      {topbar}
      <View style={s.content}>
        <RoomsPanel
          ref={roomsPanelRef}
          onRoomSelect={openRoom}
          onDmSelect={openDm}
        />
      </View>
      <BottomTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topbar: { height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1 },
  logo: { height: 22, width: 70 },
  content: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 4 },
  pillCount: { fontSize: 12, fontWeight: '600' as any },
  pillAvatarRing: { borderRadius: 11, borderWidth: 1.5, borderColor: 'transparent' },
  plusBtn: { padding: 6 },
  chatTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 2 },
  chatTitleText: { flexShrink: 1, fontSize: 15, fontWeight: '600' as any },
  // Web side-by-side layout
  slideViewport: { flex: 1, overflow: 'hidden' as any },
  slideTrack: { flexDirection: 'row', flex: 1 },
  slidePanel: { flex: 1 },
});

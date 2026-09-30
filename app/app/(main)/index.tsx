import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing, Platform, PanResponder, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '../../src/hooks/useColors';
import { useAuthStore } from '../../src/store/authStore';
import { useMobileVoice } from '../../src/context/VoiceContext';
import { ChatList, type ChatListHandle } from '../../src/components/chatList/ChatList';
import { ChatPanel, type DmMeta } from '../../src/components/ChatPanel';
import { BottomTabBar } from '../../src/components/BottomTabBar';
import { AvatarView } from '../../src/components/AvatarView';
import { IconMic, IconPlus } from '../../src/components/Icon';
import { ConnectionBanner } from '../../src/components/ConnectionBanner';
import { BrandMark } from '../../src/components/BrandMark';
import { DisplayText } from '../../src/components/ui/DisplayText';
import { IconButton } from '../../src/components/ui/Button';
import { useT } from '../../src/hooks/useT';
import { Fonts, HEADER_HEIGHT, Radius } from '../../src/theme';

const IS_WEB = Platform.OS === 'web';
// CSS ease: cubic-bezier(0.25, 0.1, 0.25, 1.0)
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1.0);

export default function RoomsScreen() {
  const { width: SW } = useWindowDimensions();
  const c = useColors();
  const t = useT();
  const { currentUser } = useAuthStore();
  const { voice, setRoom, voiceRoom, leaveAndSwitchRoom } = useMobileVoice();
  const { inVoice, voiceMembers } = voice;
  const chatListRef = useRef<ChatListHandle>(null);
  const plusBtnRef = useRef<View>(null);

  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [activeRoomPw, setActiveRoomPw] = useState<string | undefined>(undefined);
  const [activeDmMeta, setActiveDmMeta] = useState<DmMeta | null>(null);
  // Web: 0 = rooms visible, -SW = chat visible
  const slideAnim = useRef(new Animated.Value(0)).current;
  // Trigger ChatPanel modals from topbar (web chat view)
  const [membersKey, setMembersKey] = useState(0);

  const pillUser = voiceMembers.find(m => m.isSpeaking) ?? voiceMembers[0];

  // Sideways swipes in an open chat:
  //  - right: back to the list. The chat follows the finger; let go past 30% of the width
  //    (or with a flick) to close, otherwise it springs back.
  //  - left, in a room: pull out the members drawer (DMs have none).
  // Latest values through a ref: the responder is created once.
  const swipeRef = useRef({ SW, open: false, isRoom: false, close: () => {}, openMembers: () => {} });
  swipeRef.current = {
    SW,
    open: !!activeRoom,
    isRoom: !!activeRoom && !activeDmMeta,
    close: () => closeRoom(),
    openMembers: () => setMembersKey((k) => k + 1),
  };
  const swipeBack = useRef(PanResponder.create({
    // Capture: claim clearly sideways drags before the message list does; vertical ones stay scrolls
    onMoveShouldSetPanResponderCapture: (e, g) => {
      const { open, isRoom } = swipeRef.current;
      if (!open) return false;
      // Dragging inside the text box moves the cursor, not the page
      const target = (e.nativeEvent as any).target as HTMLElement | undefined;
      if (target?.closest?.('input, textarea')) return false;
      const sideways = Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
      return sideways && (g.dx > 12 || (isRoom && g.dx < -12));
    },
    onPanResponderTerminationRequest: () => false,
    // Only the swipe back moves the chat; the drawer slides in by itself once released
    onPanResponderMove: (_e, g) => slideAnim.setValue(-swipeRef.current.SW + Math.max(0, g.dx)),
    onPanResponderRelease: (_e, g) => {
      const { SW: width, close, openMembers, isRoom } = swipeRef.current;
      if (g.dx > width * 0.3 || g.vx > 0.5) { close(); return; }
      Animated.spring(slideAnim, { toValue: -width, bounciness: 0, useNativeDriver: true }).start();
      if (isRoom && (g.dx < -width * 0.2 || g.vx < -0.5)) openMembers();
    },
    onPanResponderTerminate: () =>
      Animated.spring(slideAnim, { toValue: -swipeRef.current.SW, bounciness: 0, useNativeDriver: true }).start(),
  })).current;

  function slideIn() {
    Animated.timing(slideAnim, { toValue: -SW, duration: 280, easing: EASE, useNativeDriver: true }).start();
    // The open chat gets a browser history entry, so the phone's back gesture
    // closes it instead of leaving the site
    window.history.pushState({ recoChat: true }, '');
  }

  function slideOut(cb: () => void) {
    Animated.timing(slideAnim, { toValue: 0, duration: 280, easing: EASE, useNativeDriver: true }).start(cb);
  }

  function openRoom(name: string, password?: string) {
    if (!name.startsWith('dm:')) setRoom(name);
    if (IS_WEB) {
      const wasOpen = !!activeRoom;
      setMembersKey(0);
      setActiveRoom(name);
      setActiveRoomPw(password);
      setActiveDmMeta(null);
      if (!wasOpen) slideIn();
    } else {
      router.push({ pathname: '/(main)/room/[name]', params: { name, ...(password ? { password } : {}) } });
    }
  }

  function openDm(key: string, meta: DmMeta) {
    if (IS_WEB) {
      const wasOpen = !!activeRoom;
      setMembersKey(0);
      setActiveRoom(key);
      setActiveRoomPw(undefined);
      setActiveDmMeta(meta);
      if (!wasOpen) slideIn();
    } else {
      router.push({
        pathname: '/(main)/room/[name]',
        params: {
          name: key,
          displayName: meta.screenname,
          otherUsername: meta.username,
          ...(meta.avatarExpression ? { avatarExpression: meta.avatarExpression } : {}),
          ...(meta.avatarColor ? { avatarColor: meta.avatarColor } : {}),
        },
      });
    }
  }

  function hideChat() {
    slideOut(() => {
      setActiveRoom(null);
      setActiveDmMeta(null);
    });
  }

  function closeRoom() {
    // Going back through history keeps it in step; popstate below hides the chat
    if (IS_WEB && window.history.state?.recoChat) window.history.back();
    else hideChat();
  }

  const hideChatRef = useRef(hideChat);
  hideChatRef.current = hideChat;
  useEffect(() => {
    if (!IS_WEB) return;
    const onPop = () => hideChatRef.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function handlePlusPress() {
    plusBtnRef.current?.measure((_fx, _fy, w, h, px, py) => {
      const sw = Dimensions.get('window').width;
      chatListRef.current?.openNewChatMenu({ top: py + h + 4, right: sw - px - w });
    });
  }

  // Shared voice pill used in both topbar states
  const voicePill = inVoice && voiceRoom ? (
    <TouchableOpacity
      style={[s.pill, { backgroundColor: c.accentBg }]}
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
      <IconMic size={14} color={c.accent} />
      {pillUser && (
        <View style={[s.pillAvatarRing, { borderColor: pillUser.isSpeaking ? c.success : 'transparent' }]}>
          <AvatarView username={pillUser.username} screenname={pillUser.screenname} color={pillUser.avatar_color}
            expression={pillUser.avatar_expression} size={20} />
        </View>
      )}
      <Text style={[s.pillCount, { color: c.accentText }]}>{voiceMembers.length}</Text>
    </TouchableOpacity>
  ) : null;

  // The chat list's top bar: logo, voice pill, "+". An open chat has its own
  // header (ChatPanel's), which slides in with it.
  const topbar = (
    // The app ground, like every other screen's top: it continues the phone's status bar (theme-color)
    <View style={[s.topbar, { backgroundColor: c.bg, borderBottomColor: c.border }]}>
      <View style={s.logo}>
        <BrandMark size={28} />
        <DisplayText style={[s.wordmark, { color: c.isDark ? c.accentText : c.accent }]}>Reco</DisplayText>
      </View>
      <View style={{ flex: 1 }} />
      {voicePill}
      {!currentUser?.guest && (
        <View ref={plusBtnRef} collapsable={false}>
          <IconButton label={t('welcome-join')} variant="tinted" size={40} onPress={handlePlusPress}
            icon={(color) => <IconPlus size={20} color={color} />} />
        </View>
      )}
    </View>
  );

  if (IS_WEB) {
    // Web: side-by-side panels, both slide together (matches old CSS transition)
    return (
      <SafeAreaView style={[s.root, { backgroundColor: c.surface }]} edges={['top', 'left', 'right']}>
        <ConnectionBanner />
        <View style={s.slideViewport}>
          <Animated.View style={[s.slideTrack, { width: SW * 2, transform: [{ translateX: slideAnim }] }]}>
            {/* Left panel: Rooms */}
            <View style={[s.slidePanel, { width: SW, backgroundColor: c.surface }]}>
              {topbar}
              <ChatList
                ref={chatListRef}
                selected={activeRoom}
                onOpenRoom={openRoom}
                onOpenDm={openDm}
                onDmClosed={(key) => { if (activeRoom === key) closeRoom(); }}
              />
              <BottomTabBar />
            </View>
            {/* Right panel: Chat */}
            <View style={[s.slidePanel, s.swipeArea, { width: SW, backgroundColor: c.bg }]} {...swipeBack.panHandlers}>
              {activeRoom && (
                <ChatPanel
                  key={activeRoom}
                  name={activeRoom}
                  password={activeRoomPw}
                  dmMeta={activeDmMeta}
                  showBackBtn
                  externalVoice={activeDmMeta ? null : voice}
                  onClose={closeRoom}
                  activeVoiceRoom={activeDmMeta ? undefined : voiceRoom || undefined}
                  onLeaveAndSwitch={activeDmMeta ? undefined : leaveAndSwitchRoom}
                  onNavigateToRoom={openRoom}
                  membersKey={membersKey}
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
        <ChatList ref={chatListRef} onOpenRoom={openRoom} onOpenDm={openDm} />
      </View>
      <BottomTabBar />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topbar: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12, borderBottomWidth: 1 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmark: { fontSize: 26 },
  content: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 10, borderRadius: Radius.full },
  pillCount: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  pillAvatarRing: { borderRadius: Radius.full, borderWidth: 1.5 },
  // Web side-by-side layout
  slideViewport: { flex: 1, overflow: 'hidden' as any },
  slideTrack: { flexDirection: 'row', flex: 1 },
  slidePanel: { flex: 1 },
  // The browser keeps vertical scrolling; sideways drags are ours (swipe back)
  swipeArea: { touchAction: 'pan-y' } as any,
});

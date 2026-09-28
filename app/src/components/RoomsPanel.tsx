import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet,
  TextInput, Modal, ScrollView, Dimensions, ActivityIndicator, Platform,
} from 'react-native';
import { showAlert } from '../lib/alert';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconSearch, IconPlus, IconLock, IconHash, IconClose } from './Icon';
import { DisplayText } from './ui/DisplayText';
import { TextField } from './ui/TextField';
import { ModalFrame } from './account/ModalFrame';
import { HEADER_HEIGHT } from './chat/ChatHeader';
import { Fonts, Radius, Spacing } from '../theme';
import { playNotifSound } from '../lib/sounds';
import { useSoundStore } from '../store/soundStore';
import { useBlockStore } from '../store/blockStore';

// Unified entry — room or DM
interface Entry {
  type: 'room' | 'dm';
  key: string;           // room name or dm_room
  displayName: string;
  hasPassword?: boolean;
  needsPassword?: boolean; // false for owner / room admins / existing members
  otherUsername?: string;
  avatarExpression?: string;
  avatarColor?: string;
  unread: number;
  lastActivity: number;  // Date.now() when last message arrived; 0 = never
}

// Keep DmEntry export for callers
export interface DmEntry {
  dm_room: string;
  other_username: string;
  other_screenname: string;
  avatar_expression: string;
  avatar_color: string;
  unread?: number;
}

interface Props {
  onRoomSelect?: (name: string, password?: string) => void;
  onDmSelect?: (dm: DmEntry) => void;
  onDmClose?: (dmRoom: string) => void;
  selectedRoom?: string | null;
  showSidebarHeader?: boolean;
}

export interface RoomsPanelHandle {
  /** Opens the create / join menu, under `pos` or, without one, under the + button */
  openDropdown: (pos?: { top: number; right: number }) => void;
}

export const RoomsPanel = forwardRef<RoomsPanelHandle, Props>(function RoomsPanel({ onRoomSelect, onDmSelect, onDmClose, selectedRoom, showSidebarHeader = false }: Props, ref) {
  const { currentUser } = useAuthStore();
  const c = useColors();
  const t = useT();
  const setBlocked = useBlockStore(s => s.setBlocked);
  const soundEnabled = useSoundStore(s => s.soundEnabled);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const plusBtnRef = useRef<View>(null);

  // Create room modal
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPw, setNewRoomPw] = useState('');
  const [createError, setCreateError] = useState('');
  const pendingCreatePwRef = useRef('');

  // Find room modal
  const [showFind, setShowFind] = useState(false);
  const [findCode, setFindCode] = useState('');
  const [findError, setFindError] = useState('');

  // Password input modal (for password-protected rooms)
  const [pendingEntry, setPendingEntry] = useState<Entry | null>(null);
  const [showPwModal, setShowPwModal] = useState(false);
  const [roomPwInput, setRoomPwInput] = useState('');
  const [roomPwError, setRoomPwError] = useState('');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Stable refs
  const selectedRoomRef = useRef(selectedRoom);
  useEffect(() => { selectedRoomRef.current = selectedRoom; }, [selectedRoom]);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const onRoomSelectRef = useRef(onRoomSelect);
  useEffect(() => { onRoomSelectRef.current = onRoomSelect; }, [onRoomSelect]);
  const onDmSelectRef = useRef(onDmSelect);
  useEffect(() => { onDmSelectRef.current = onDmSelect; }, [onDmSelect]);
  const loadingHistoryRef = useRef(new Set<string>());

  useEffect(() => {
    if (!currentUser) return;
    const socket = getSocket();
    const load = () => {
      socket.emit('get_rooms', {});
      socket.emit('get_dms', {});
      socket.emit('get_blocked_users', {});
    };
    load();

    const onRoomsList = (data: { rooms: { name: string; has_password: boolean; needs_password?: boolean; code?: string }[] }) => {
      setRoomsLoading(false);
      setEntries(prev => {
        const existing = new Map(prev.map(e => [e.key, e]));
        const roomEntries: Entry[] = data.rooms.map(r => ({
          ...existing.get(r.name),
          type: 'room' as const,
          key: r.name,
          displayName: r.name,
          hasPassword: r.has_password,
          needsPassword: r.needs_password,
          unread: existing.get(r.name)?.unread ?? 0,
          lastActivity: existing.get(r.name)?.lastActivity ?? 0,
        }));
        const dmEntries = prev.filter(e => e.type === 'dm');
        return [...roomEntries, ...dmEntries];
      });
    };

    const onNewRoomCreated = (data: { room: string; has_password: boolean; owner?: string }) => {
      setEntries(prev =>
        prev.find(e => e.key === data.room) ? prev : [
          ...prev,
          {
            type: 'room', key: data.room, displayName: data.room, hasPassword: data.has_password,
            needsPassword: data.has_password && data.owner !== currentUser.username,
            unread: 0, lastActivity: Date.now(),
          },
        ]
      );
    };

    const onCreateRoomResult = (data: any) => {
      if (!data.success) { setCreateError(t.server(data, 'err-create-failed')); return; }
      const pw = pendingCreatePwRef.current;
      setShowCreate(false); setNewRoomName(''); setNewRoomPw(''); setCreateError('');
      if (data.code) showAlert(t('create-room'), `${t('room-code')}: ${data.code}`);
      const entry: Entry = { type: 'room', key: data.room, displayName: data.room, hasPassword: data.has_password, needsPassword: false, unread: 0, lastActivity: Date.now() };
      navigateTo(entry, pw || undefined);
    };

    const onFindRoomResult = (data: any) => {
      if (!data.success) { setFindError(t.server(data, 'err-find-failed')); return; }
      setShowFind(false); setFindCode(''); setFindError('');
      const entry: Entry = { type: 'room', key: data.room, displayName: data.room, hasPassword: data.has_password, needsPassword: data.needs_password, unread: 0, lastActivity: 0 };
      // Add to list if not present
      setEntries(prev => prev.find(e => e.key === data.room) ? prev : [...prev, entry]);
      if (data.needs_password) {
        setPendingEntry(entry);
        setRoomPwInput('');
        setRoomPwError('');
        setShowPwModal(true);
      } else {
        navigateTo(entry);
      }
    };

    const onDmsList = (data: { dms: DmEntry[] }) => {
      setEntries(prev => {
        const existing = new Map(prev.map(e => [e.key, e]));
        const dmEntries: Entry[] = data.dms.map(d => ({
          ...existing.get(d.dm_room),
          type: 'dm' as const,
          key: d.dm_room,
          displayName: d.other_screenname,
          otherUsername: d.other_username,
          avatarExpression: d.avatar_expression,
          avatarColor: d.avatar_color,
          unread: existing.get(d.dm_room)?.unread ?? 0,
          lastActivity: existing.get(d.dm_room)?.lastActivity ?? 0,
        }));
        const roomEntries = prev.filter(e => e.type === 'room');
        return [...roomEntries, ...dmEntries];
      });
    };

    const onNewDmNotification = (data: { dm_room: string; from_username: string; from_screenname: string; avatar_expression?: string; avatar_color?: string }) => {
      setEntries(prev => {
        const existing = prev.find(e => e.key === data.dm_room);
        if (existing) {
          return prev.map(e => e.key === data.dm_room
            ? { ...e, lastActivity: Date.now(), unread: e.unread + 1 }
            : e
          );
        }
        return [...prev, {
          type: 'dm',
          key: data.dm_room,
          displayName: data.from_screenname,
          otherUsername: data.from_username,
          avatarExpression: data.avatar_expression || 'Smile',
          avatarColor: data.avatar_color || '#5865F2',
          unread: 1,
          lastActivity: Date.now(),
        }];
      });
      socket.emit('room_subscribe', { room: data.dm_room });
    };

    const onJoinResult = (data: any) => {
      const room = data.room ?? selectedRoomRef.current;
      if (room) loadingHistoryRef.current.delete(room);
      // Now a member — the password is never asked again
      if (data.success && data.room) {
        setEntries(prev => prev.some(e => e.key === data.room)
          ? prev.map(e => e.key === data.room ? { ...e, needsPassword: false } : e)
          : [...prev, {
              type: 'room', key: data.room, displayName: data.room, hasPassword: !!data.has_password,
              needsPassword: false, unread: 0, lastActivity: Date.now(),
            }]);
      }
    };
    const onJoinDmResult = (data: any) => {
      if (data.dm_room) loadingHistoryRef.current.delete(data.dm_room);
    };

    const onMessage = (data: any) => {
      if (!data.room || data.system) return;
      const msgRoom = data.room as string;
      const isLoading = loadingHistoryRef.current.has(msgRoom);
      const isActive = msgRoom === selectedRoomRef.current;
      if (!isLoading && !isActive && data.username !== currentUser?.username && soundEnabledRef.current) {
        playNotifSound();
      }
      if (isLoading) return;
      setEntries(prev => {
        const idx = prev.findIndex(e => e.key === msgRoom);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], unread: isActive ? 0 : prev[idx].unread + 1 };
        if (idx === 0) return prev.map((e, i) => i === 0 ? updated : e);
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    };

    const onBlockedList = (data: { users: string[] }) => setBlocked(data.users);

    socket.on('connect', load);
    socket.on('blocked_users_list', onBlockedList);
    socket.on('rooms_list', onRoomsList);
    socket.on('new_room_created', onNewRoomCreated);
    socket.on('create_room_result', onCreateRoomResult);
    socket.on('find_room_result', onFindRoomResult);
    socket.on('dms_list', onDmsList);
    socket.on('new_dm_notification', onNewDmNotification);
    const onLeaveRoomResult = (data: { success: boolean; room: string }) => {
      if (data.success) setEntries(prev => prev.filter(e => e.key !== data.room));
    };
    const onKickedFromRoom = (data: { room: string }) => {
      setEntries(prev => prev.filter(e => e.key !== data.room));
    };

    socket.on('join_result', onJoinResult);
    socket.on('join_dm_result', onJoinDmResult);
    socket.on('leave_room_result', onLeaveRoomResult);
    socket.on('kicked_from_room', onKickedFromRoom);
    socket.on('room_closed', onKickedFromRoom);
    socket.on('message', onMessage);

    return () => {
      socket.off('connect', load);
      socket.off('blocked_users_list', onBlockedList);
      socket.off('rooms_list', onRoomsList);
      socket.off('new_room_created', onNewRoomCreated);
      socket.off('create_room_result', onCreateRoomResult);
      socket.off('find_room_result', onFindRoomResult);
      socket.off('dms_list', onDmsList);
      socket.off('new_dm_notification', onNewDmNotification);
      socket.off('join_result', onJoinResult);
      socket.off('join_dm_result', onJoinDmResult);
      socket.off('leave_room_result', onLeaveRoomResult);
      socket.off('kicked_from_room', onKickedFromRoom);
      socket.off('room_closed', onKickedFromRoom);
      socket.off('message', onMessage);
    };
  }, [currentUser, setBlocked, t]);

  // Server order (lobby first), with each room moved to the top when a message arrives (see onMessage)
  const sorted = entries.filter(e => e.displayName.toLowerCase().includes(search.toLowerCase()));

  function navigateTo(entry: Entry, password?: string) {
    loadingHistoryRef.current.add(entry.key);
    if (entry.type === 'room') {
      if (onRoomSelectRef.current) {
        onRoomSelectRef.current(entry.key, password);
      } else {
        router.push({ pathname: '/(main)/room/[name]', params: { name: entry.key, password: password ?? '' } });
      }
    } else {
      const dm: DmEntry = {
        dm_room: entry.key,
        other_username: entry.otherUsername!,
        other_screenname: entry.displayName,
        avatar_expression: entry.avatarExpression ?? 'Smile',
        avatar_color: entry.avatarColor ?? '#5865F2',
      };
      if (onDmSelectRef.current) {
        onDmSelectRef.current(dm);
      } else {
        router.push({
          pathname: '/(main)/room/[name]',
          params: {
            name: entry.key,
            displayName: entry.displayName,
            otherUsername: entry.otherUsername,
            avatarColor: entry.avatarColor,
            avatarExpression: entry.avatarExpression,
          },
        });
      }
    }
  }

  function handlePress(entry: Entry) {
    setEntries(prev => prev.map(e => e.key === entry.key ? { ...e, unread: 0 } : e));
    if (entry.type === 'room' && entry.needsPassword) {
      setPendingEntry(entry);
      setRoomPwInput('');
      setRoomPwError('');
      setShowPwModal(true);
      return;
    }
    navigateTo(entry);
  }

  function closeDm(entry: Entry) {
    setEntries(prev => prev.filter(e => e.key !== entry.key));
    setHoveredKey(null);
    getSocket().emit('close_dm', { dm_room: entry.key });
    onDmClose?.(entry.key);
  }

  function confirmCloseDm(entry: Entry) {
    showAlert(t('close-dm'), entry.displayName, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('close'), style: 'destructive', onPress: () => closeDm(entry) },
    ]);
  }

  function openDropdown(pos?: { top: number; right: number }) {
    if (pos) {
      setDropdownPos(pos);
      setShowDropdown(true);
    } else {
      plusBtnRef.current?.measure((_fx, _fy, width, height, px, py) => {
        const screenWidth = Dimensions.get('window').width;
        setDropdownPos({ top: py + height + 4, right: screenWidth - px - width });
        setShowDropdown(true);
      });
    }
  }

  useImperativeHandle(ref, () => ({ openDropdown }));

  function doCreate() {
    const trimmed = newRoomName.trim();
    if (!trimmed) { setCreateError(t('err-room-name-required')); return; }
    if (!currentUser) return;
    setCreateError('');
    pendingCreatePwRef.current = newRoomPw.trim();
    getSocket().emit('create_room', { room: trimmed, password: newRoomPw.trim() });
  }

  function doFind() {
    const code = findCode.trim();
    if (!code) return;
    setFindError('');
    getSocket().emit('find_room', { code });
  }

  function doJoinWithPw() {
    if (!roomPwInput.trim()) { setRoomPwError(t('err-fill-required')); return; }
    if (!pendingEntry) return;
    const pw = roomPwInput.trim();
    setShowPwModal(false);
    navigateTo(pendingEntry, pw);
  }

  const plusDropdown = (
    <Modal visible={showDropdown} transparent animationType="none" onRequestClose={() => setShowDropdown(false)}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDropdown(false)} activeOpacity={1}>
        <View style={[s.dropdown, { position: 'absolute', top: dropdownPos.top, right: dropdownPos.right, backgroundColor: c.surface, borderColor: c.border }]}>
          <TouchableOpacity style={s.dropdownItem} onPress={() => { setShowDropdown(false); setNewRoomName(''); setNewRoomPw(''); setCreateError(''); setShowCreate(true); }} activeOpacity={0.8}>
            <View style={[s.dropdownIcon, { backgroundColor: c.accentBg }]}><IconPlus size={16} color={c.accent} /></View>
            <Text style={[s.dropdownText, { color: c.text }]}>{t('create-room')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dropdownItem} onPress={() => { setShowDropdown(false); setFindCode(''); setFindError(''); setShowFind(true); }} activeOpacity={0.8}>
            <View style={[s.dropdownIcon, { backgroundColor: c.accentBg }]}><IconSearch size={16} color={c.accent} /></View>
            <Text style={[s.dropdownText, { color: c.text }]}>{t('find-room')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const searchBar = (
    <View style={[s.searchWrap, { backgroundColor: c.bg }]}>
      <IconSearch size={16} color={c.textMuted} />
      <TextInput
        style={[s.searchInput, { color: c.text }]}
        placeholder={t('ph-search-chats')}
        placeholderTextColor={c.textMuted}
        value={search}
        onChangeText={setSearch}
        accessibilityLabel={t('ph-search-chats')}
      />
    </View>
  );

  const plusButton = !currentUser?.guest && (
    <TouchableOpacity ref={plusBtnRef} style={[s.plusBtn, { backgroundColor: c.accentBg }]} onPress={() => openDropdown()}
      activeOpacity={0.7} accessibilityLabel={`${t('create-room')} / ${t('find-room')}`}>
      <IconPlus size={18} color={c.accent} />
    </TouchableOpacity>
  );

  const row = (entry: Entry) => {
    const isActive = entry.key === selectedRoom;
    const showClose = entry.type === 'dm' && hoveredKey === entry.key;
    return (
      <Pressable
        key={entry.key}
        style={({ pressed }) => [s.roomItem, isActive && { backgroundColor: c.accentBg }, pressed && { opacity: 0.75 }]}
        onPress={() => handlePress(entry)}
        onHoverIn={() => setHoveredKey(entry.key)}
        onHoverOut={() => setHoveredKey(k => (k === entry.key ? null : k))}
        onLongPress={entry.type === 'dm' && Platform.OS !== 'web' ? () => confirmCloseDm(entry) : undefined}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
      >
        {entry.type === 'room' ? (
          <View style={[s.roomIcon, { backgroundColor: isActive ? c.accent : c.accentBg }]}>
            <IconHash size={18} color={isActive ? c.onAccent : c.accent} />
          </View>
        ) : (
          <AvatarView
            expression={entry.avatarExpression}
            color={entry.avatarColor}
            username={entry.otherUsername}
            screenname={entry.displayName}
            size={36}
          />
        )}
        <Text style={[s.roomName, { color: isActive ? c.accentText : c.text }, isActive && s.roomNameActive]} numberOfLines={1}>
          {entry.type === 'room' ? t.room(entry.displayName) : entry.displayName}
        </Text>
        {entry.type === 'room' && entry.hasPassword && <IconLock size={13} color={c.textMuted} />}
        {showClose ? (
          <Pressable
            style={({ hovered }: any) => [s.closeBtn, hovered && { backgroundColor: c.surface2 }]}
            onPress={() => closeDm(entry)}
            hitSlop={6}
            accessibilityLabel={t('close-dm')}
          >
            <IconClose size={12} color={c.textSub} />
          </Pressable>
        ) : entry.unread > 0 && (
          <View style={[s.badge, { backgroundColor: c.unread }]} accessibilityLabel={`${entry.unread}`}>
            <Text style={[s.badgeText, { color: c.unreadText }]}>{entry.unread > 99 ? '99+' : entry.unread}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const rooms = sorted.filter((e) => e.type === 'room');
  const dms = sorted.filter((e) => e.type === 'dm');
  const section = (label: string, list: Entry[]) => list.length > 0 && (
    <View style={s.section}>
      <Text style={[s.sectionLabel, { color: c.textMuted }]}>{label}</Text>
      {list.map(row)}
    </View>
  );

  return (
    <View style={s.container}>
      {showSidebarHeader ? (
        <>
          <View style={s.sidebarHeader}>
            <DisplayText style={[s.sidebarTitle, { color: c.text }]}>{t('nav-chats')}</DisplayText>
            {plusButton}
            {plusDropdown}
          </View>
          <View style={s.searchOnlyBar}>
            {searchBar}
          </View>
        </>
      ) : (
        <View style={s.topBar}>
          {searchBar}
          {plusDropdown}
        </View>
      )}

      {roomsLoading && (
        <ActivityIndicator size="small" color={c.accent} style={{ marginTop: 24 }} />
      )}
      <ScrollView contentContainerStyle={s.scrollContent}>
        {section(t('section-rooms'), rooms)}
        {section(t('section-dms'), dms)}
      </ScrollView>

      {/* Create room */}
      <ModalFrame
        visible={showCreate}
        title={t('create-room')}
        onClose={() => setShowCreate(false)}
        error={createError}
        confirmLabel={t('create-room')}
        onConfirm={doCreate}
      >
        <TextField
          placeholder={t('ph-room-name')}
          value={newRoomName}
          onChangeText={setNewRoomName}
          autoFocus
          onSubmitEditing={doCreate}
        />
        <TextField
          placeholder={t('ph-room-password')}
          value={newRoomPw}
          onChangeText={setNewRoomPw}
          secureTextEntry
          autoComplete="new-password" textContentType="newPassword"
          onSubmitEditing={doCreate}
        />
      </ModalFrame>

      {/* Find room by code */}
      <ModalFrame
        visible={showFind}
        title={t('find-room')}
        onClose={() => setShowFind(false)}
        error={findError}
        confirmLabel={t('find-room')}
        onConfirm={doFind}
      >
        <TextField
          placeholder={t('ph-find-code')}
          value={findCode}
          onChangeText={setFindCode}
          keyboardType="number-pad"
          autoFocus
          onSubmitEditing={doFind}
        />
      </ModalFrame>

      {/* Password for a protected room */}
      <ModalFrame
        visible={showPwModal}
        title={t('enter-room-pw')}
        onClose={() => setShowPwModal(false)}
        error={roomPwError}
        confirmLabel={t('ok')}
        onConfirm={doJoinWithPw}
      >
        <TextField
          placeholder={t('ph-room-password')}
          value={roomPwInput}
          onChangeText={setRoomPwInput}
          secureTextEntry
          autoComplete="current-password" textContentType="password"
          autoFocus
          onSubmitEditing={doJoinWithPw}
        />
      </ModalFrame>
    </View>
  );
});

const s = StyleSheet.create({
  container: { flex: 1 },

  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: HEADER_HEIGHT, paddingLeft: 20, paddingRight: 14, // lines up with the chat header
  },
  sidebarTitle: { fontSize: 24 },

  searchOnlyBar: { paddingHorizontal: 14, paddingBottom: 10 },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 14, paddingVertical: 10 },
  // flexGrow, not flex: in the sidebar's column a flex basis of 0 would squash the height
  searchWrap: {
    flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 42, borderRadius: 14, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, outlineStyle: 'none' } as any,

  plusBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dropdown: {
    minWidth: 220, borderRadius: Radius.lg, borderWidth: 1, padding: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 16,
    elevation: 10,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 10, borderRadius: Radius.md },
  dropdownIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dropdownText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },

  scrollContent: { paddingHorizontal: 10, paddingBottom: Spacing.lg },

  section: { gap: 2, marginTop: 6 },
  sectionLabel: {
    fontSize: 12, fontWeight: String(Fonts.heavy) as any, letterSpacing: 0.6, textTransform: 'uppercase',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  roomItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14,
  },
  roomIcon: { width: 36, height: 36, borderRadius: 12, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  roomName: { flex: 1, fontSize: 15, fontWeight: String(Fonts.bold) as any },
  roomNameActive: { fontWeight: String(Fonts.heavy) as any },
  badge: {
    minWidth: 22, height: 22, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7,
  },
  badgeText: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  closeBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },


});

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet,
  TextInput, Modal, ScrollView, Alert, Dimensions, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { AvatarView } from './AvatarView';
import { IconSearch, IconPlus, IconLock, IconGroup, IconClose } from './Icon';
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
  openDropdown: (pos: { top: number; right: number }) => void;
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
    socket.emit('get_rooms', { username: currentUser.username });
    socket.emit('get_dms', { username: currentUser.username });
    socket.emit('user_online', { username: currentUser.username });
    socket.emit('get_blocked_users', { username: currentUser.username });

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
      if (!data.success) { setCreateError(data.msg || t('err-create-failed')); return; }
      const pw = pendingCreatePwRef.current;
      setShowCreate(false); setNewRoomName(''); setNewRoomPw(''); setCreateError('');
      if (data.code) Alert.alert(t('create-room'), `${t('room-code')}: ${data.code}`);
      const entry: Entry = { type: 'room', key: data.room, displayName: data.room, hasPassword: data.has_password, needsPassword: false, unread: 0, lastActivity: Date.now() };
      navigateTo(entry, pw || undefined);
    };

    const onFindRoomResult = (data: any) => {
      if (!data.success) { setFindError(data.msg || t('err-find-failed')); return; }
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

    const onNewDmNotification = (data: { dm_room: string; from_username: string; from_screenname: string }) => {
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
          avatarExpression: 'Smile',
          avatarColor: '#5865F2',
          unread: 1,
          lastActivity: Date.now(),
        }];
      });
      socket.emit('join_dm', { username: currentUser?.username, dm_room: data.dm_room, since: null });
    };

    const onJoinResult = (data: any) => {
      const room = data.room ?? selectedRoomRef.current;
      if (room) loadingHistoryRef.current.delete(room);
      // Now a member — the password is never asked again
      if (data.success && data.room) {
        setEntries(prev => prev.map(e => e.key === data.room ? { ...e, needsPassword: false } : e));
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

    const onConnect = () => {
      socket.emit('get_rooms', { username: currentUser.username });
      socket.emit('get_dms', { username: currentUser.username });
      socket.emit('user_online', { username: currentUser.username });
      socket.emit('get_blocked_users', { username: currentUser.username });
    };

    const onRoomInvite = (data: { from: string; room: string }) => {
      Alert.alert(
        t('room-invite-title'),
        `${data.from} ${t('room-invite-msg')} 「${data.room}」`,
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('join'), onPress: () => {
            if (onRoomSelectRef.current) {
              onRoomSelectRef.current(data.room);
            } else {
              router.push({ pathname: '/(main)/room/[name]', params: { name: data.room } });
            }
          }},
        ]
      );
    };

    socket.on('connect', onConnect);
    socket.on('blocked_users_list', onBlockedList);
    socket.on('room_invite', onRoomInvite);
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
    socket.on('message', onMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('blocked_users_list', onBlockedList);
      socket.off('room_invite', onRoomInvite);
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
      socket.off('message', onMessage);
    };
  }, [currentUser]);

  // Sort by lastActivity desc
  // 不排序：顺序由服务器决定，新消息到达时 onMessage 把房间移到第0位（同老 web bumpRoomToTop）
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
    getSocket().emit('close_dm', { username: currentUser?.username, dm_room: entry.key });
    onDmClose?.(entry.key);
  }

  function confirmCloseDm(entry: Entry) {
    Alert.alert(t('close-dm'), entry.displayName, [
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
    getSocket().emit('create_room', { username: currentUser.username, room: trimmed, password: newRoomPw.trim() });
  }

  function doFind() {
    const code = findCode.trim();
    if (!code) return;
    setFindError('');
    getSocket().emit('find_room', { code, username: currentUser?.username });
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
        <View style={[s.dropdown, { position: 'absolute', top: dropdownPos.top, right: dropdownPos.right, backgroundColor: c.surface }]}>
          <TouchableOpacity style={s.dropdownItem} onPress={() => { setShowDropdown(false); setNewRoomName(''); setNewRoomPw(''); setCreateError(''); setShowCreate(true); }} activeOpacity={0.8}>
            <IconPlus size={14} color={c.text} />
            <Text style={[s.dropdownText, { color: c.text }]}>{t('create-room')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.dropdownItem} onPress={() => { setShowDropdown(false); setFindCode(''); setFindError(''); setShowFind(true); }} activeOpacity={0.8}>
            <IconSearch size={14} color={c.text} />
            <Text style={[s.dropdownText, { color: c.text }]}>{t('find-room')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const searchBar = (
    <View style={[s.searchWrap, { backgroundColor: c.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)' }]}>
      <IconSearch size={14} color={c.textMuted} />
      <TextInput
        style={[s.searchInput, { color: c.text }]}
        placeholder={t('rooms')}
        placeholderTextColor={c.textMuted}
        value={search}
        onChangeText={setSearch}
      />
    </View>
  );

  return (
    <View style={s.container}>
      {showSidebarHeader ? (
        <>
          <View style={[s.sidebarHeader, { borderBottomColor: c.border }]}>
            <Text style={[s.sidebarTitle, { color: c.text }]}>{t('rooms')}</Text>
            <TouchableOpacity ref={plusBtnRef} style={s.plusBtn} onPress={() => openDropdown()} activeOpacity={0.7}>
              <IconPlus size={18} color={c.accent} />
            </TouchableOpacity>
            {plusDropdown}
          </View>
          <View style={[s.searchOnlyBar, { borderBottomColor: c.border }]}>
            {searchBar}
          </View>
        </>
      ) : (
        <View style={[s.topBar, { borderBottomColor: c.border }]}>
          {searchBar}
          {plusDropdown}
        </View>
      )}

      {roomsLoading && (
        <ActivityIndicator size="small" color={c.accent} style={{ marginTop: 24 }} />
      )}
      <ScrollView contentContainerStyle={s.scrollContent}>
        {sorted.map(entry => {
          const isActive = entry.key === selectedRoom;
          const showClose = entry.type === 'dm' && hoveredKey === entry.key;
          return (
            <Pressable
              key={entry.key}
              style={({ pressed }) => [s.roomItem, isActive && { backgroundColor: c.accentBg }, pressed && { opacity: 0.7 }]}
              onPress={() => handlePress(entry)}
              onHoverIn={() => setHoveredKey(entry.key)}
              onHoverOut={() => setHoveredKey(k => (k === entry.key ? null : k))}
              onLongPress={entry.type === 'dm' && Platform.OS !== 'web' ? () => confirmCloseDm(entry) : undefined}
            >
              {entry.type === 'room' ? (
                <View style={s.roomIcon}>
                  <IconGroup size={24} color={isActive ? c.accent : c.textMuted} />
                </View>
              ) : (
                <AvatarView
                  expression={entry.avatarExpression}
                  color={entry.avatarColor}
                  username={entry.otherUsername}
                  screenname={entry.displayName}
                  size={24}
                />
              )}
              <Text
                style={[s.roomName, { color: isActive ? c.text : c.textSub }, isActive && s.roomNameActive]}
                numberOfLines={1}
              >
                {entry.displayName}
              </Text>
              {entry.type === 'room' && entry.hasPassword && <IconLock size={12} color={c.textMuted} />}
              {showClose ? (
                <Pressable
                  style={({ hovered }: any) => [s.closeBtn, hovered && { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}
                  onPress={() => closeDm(entry)}
                  hitSlop={6}
                  accessibilityLabel={t('close-dm')}
                >
                  <IconClose size={12} color={c.textMuted} />
                </Pressable>
              ) : entry.unread > 0 && (
                <View style={[s.badge, { backgroundColor: c.unread }]}>
                  <Text style={s.badgeText}>{entry.unread > 99 ? '99+' : entry.unread}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 创建房间 */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <TouchableOpacity style={s.overlay} onPress={() => setShowCreate(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('create-room')}</Text>
            {!!createError && <Text style={[s.errorText, { color: c.danger }]}>{createError}</Text>}
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-room-name')}
              placeholderTextColor={c.textMuted}
              value={newRoomName}
              onChangeText={setNewRoomName}
              autoFocus
              onSubmitEditing={doCreate}
            />
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-room-password')}
              placeholderTextColor={c.textMuted}
              value={newRoomPw}
              onChangeText={setNewRoomPw}
              secureTextEntry
              autoComplete="new-password" textContentType="newPassword"
              onSubmitEditing={doCreate}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowCreate(false)}>
                <Text style={[s.cancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: c.accent }]} onPress={doCreate} activeOpacity={0.86}>
                <Text style={s.confirmText}>{t('create-room')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 搜索房间 */}
      <Modal visible={showFind} transparent animationType="fade" onRequestClose={() => setShowFind(false)}>
        <TouchableOpacity style={s.overlay} onPress={() => setShowFind(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('find-room')}</Text>
            {!!findError && <Text style={[s.errorText, { color: c.danger }]}>{findError}</Text>}
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-find-code')}
              placeholderTextColor={c.textMuted}
              value={findCode}
              onChangeText={setFindCode}
              keyboardType="number-pad"
              autoFocus
              onSubmitEditing={doFind}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowFind(false)}>
                <Text style={[s.cancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: c.accent }]} onPress={doFind} activeOpacity={0.86}>
                <Text style={s.confirmText}>{t('find-room')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 密码保护房间 */}
      <Modal visible={showPwModal} transparent animationType="fade" onRequestClose={() => setShowPwModal(false)}>
        <TouchableOpacity style={s.overlay} onPress={() => setShowPwModal(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.modalBox, { backgroundColor: c.surface }]} onPress={() => {}} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: c.text }]}>{t('enter-room-pw')}</Text>
            {!!roomPwError && <Text style={[s.errorText, { color: c.danger }]}>{roomPwError}</Text>}
            <TextInput
              style={[s.modalInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder={t('ph-room-password')}
              placeholderTextColor={c.textMuted}
              value={roomPwInput}
              onChangeText={setRoomPwInput}
              secureTextEntry
              autoComplete="current-password" textContentType="password"
              autoFocus
              onSubmitEditing={doJoinWithPw}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: c.border }]} onPress={() => setShowPwModal(false)}>
                <Text style={[s.cancelText, { color: c.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: c.accent }]} onPress={doJoinWithPw} activeOpacity={0.86}>
                <Text style={s.confirmText}>{t('ok')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

const s = StyleSheet.create({
  container: { flex: 1 },

  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sidebarTitle: { fontSize: 16, fontWeight: String(Fonts.bold) as any },

  searchOnlyBar: {
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  plusBtn: { padding: 3, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  dropdown: {
    minWidth: 180, borderRadius: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12,
    elevation: 10,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingHorizontal: 16 },
  dropdownText: { fontSize: 14 },

  scrollContent: { paddingHorizontal: 8, paddingVertical: 4, paddingBottom: Spacing.lg },

  roomItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
  },
  roomIcon: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  roomName: { flex: 1, fontSize: 15, fontWeight: String(Fonts.regular) as any },
  roomNameActive: { fontWeight: String(Fonts.medium) as any },
  badge: {
    minWidth: 18, height: 18, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: String(Fonts.bold) as any },
  closeBtn: { width: 20, height: 20, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xxl },
  modalBox: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 17, fontWeight: String(Fonts.bold) as any },
  errorText: { fontSize: 13 },
  modalInput: { borderRadius: Radius.md, padding: 12, fontSize: 15, borderWidth: 1 },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end', marginTop: Spacing.xs },
  cancelBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1 },
  cancelText: { fontSize: 14 },
  confirmBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 9, borderRadius: Radius.md },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: String(Fonts.semibold) as any },

});

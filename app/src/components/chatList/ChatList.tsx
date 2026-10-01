import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PushPrompt } from '../notifications/PushPrompt';
import { IconBellOff, IconCheck, IconClose, IconPin, IconPlus, IconSearch } from '../Icon';
import { DisplayText } from '../ui/DisplayText';
import { Menu, type MenuAnchor, type MenuItem } from '../ui/Menu';
import type { DmMeta } from '../chat/types';
import { useAuthStore } from '../../store/authStore';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { Fonts, HEADER_HEIGHT, Spacing } from '../../theme';
import { ChatRow } from './ChatRow';
import { CreateRoomDialog, FindRoomDialog, RoomPasswordDialog, type FoundRoom } from './NewRoomDialogs';
import { sections, type ChatEntry } from './model';
import { useChatList } from './useChatList';

interface Props {
  /** The chat on screen, highlighted and read as messages arrive */
  selected?: string | null;
  onOpenRoom: (name: string, password?: string) => void;
  onOpenDm: (key: string, meta: DmMeta) => void;
  /** A DM was closed from the list (the screen may be showing it) */
  onDmClosed?: (key: string) => void;
  /** Desktop sidebar: a "Chats" title with the + beside it, instead of + next to the search box */
  sidebarHeader?: boolean;
}

export interface ChatListHandle {
  /** The create / find room menu: at `anchor`, or under the list's own + button */
  openNewChatMenu: (anchor?: MenuAnchor) => void;
}

/** Your rooms and DMs: search, sections, and getting into a new room. */
export const ChatList = forwardRef<ChatListHandle, Props>(function ChatList(p, ref) {
  const c = useColors();
  const t = useT();
  const me = useAuthStore((s) => s.currentUser);
  const list = useChatList(p.selected);
  const [search, setSearch] = useState('');
  const [swiped, setSwiped] = useState<string | null>(null);

  // Menus and dialogs, at most one at a time
  const [newChatAt, setNewChatAt] = useState<MenuAnchor | null>(null);
  const [rowMenu, setRowMenu] = useState<{ entry: ChatEntry; at: MenuAnchor } | null>(null);
  const [dialog, setDialog] = useState<'create' | 'find' | null>(null);
  const [askPassword, setAskPassword] = useState<FoundRoom | null>(null);
  const plusButton = useRef<View>(null);

  function openNewChatMenu(anchor?: MenuAnchor) {
    if (anchor) { setNewChatAt(anchor); return; }
    plusButton.current?.measure((_x, _y, w, h, pageX, pageY) =>
      setNewChatAt({ top: pageY + h + 4, right: Dimensions.get('window').width - pageX - w }));
  }
  useImperativeHandle(ref, () => ({ openNewChatMenu }));

  function open(entry: ChatEntry, password?: string) {
    list.opened(entry.key);
    if (entry.kind === 'room') {
      p.onOpenRoom(entry.key, password);
    } else {
      p.onOpenDm(entry.key, {
        username: entry.otherUsername ?? '',
        screenname: entry.name,
        avatarExpression: entry.avatarExpression,
        avatarColor: entry.avatarColor,
      });
    }
  }

  /** A room from the dialogs: into the list, then open it (asking for its password if needed).
   *  It stays "needs a password" until a join actually works (join_result, in useChatList). */
  function enterRoom(room: FoundRoom, password?: string) {
    list.addRoom(room);
    const entry: ChatEntry = {
      kind: 'room', key: room.name, name: room.name, unread: 0, pinned: false, muted: false,
      hasPassword: room.hasPassword, needsPassword: room.needsPassword,
    };
    if (room.needsPassword && !password) setAskPassword(room);
    else open(entry, password);
  }

  function closeDm(key: string) {
    list.closeDm(key);
    p.onDmClosed?.(key);
  }

  const rowMenuItems = (entry: ChatEntry): MenuItem[] => [
    {
      label: entry.pinned ? t('unpin') : t('pin'), icon: (color) => <IconPin size={15} color={color} />,
      onPress: () => list.setPref(entry.key, { pinned: !entry.pinned }),
    },
    {
      label: entry.muted ? t('unmute-chat') : t('mute-chat'), icon: (color) => <IconBellOff size={15} color={color} />,
      onPress: () => list.setPref(entry.key, { muted: !entry.muted }),
    },
    ...(entry.unread > 0 ? [{
      label: t('mark-read'), icon: (color: string) => <IconCheck size={15} color={color} />, onPress: () => list.markRead(entry.key),
    }] : []),
    ...(entry.kind === 'dm' ? [{
      label: t('close-dm'), icon: (color: string) => <IconClose size={15} color={color} />, onPress: () => closeDm(entry.key),
    }] : []),
  ];

  const newChatItems: MenuItem[] = [
    { label: t('create-room'), primary: true, icon: (color) => <IconPlus size={16} color={color} />, onPress: () => setDialog('create') },
    { label: t('find-room'), primary: true, icon: (color) => <IconSearch size={16} color={color} />, onPress: () => setDialog('find') },
  ];

  const searchBox = (
    <View style={[s.search, { backgroundColor: c.bg }]}>
      <IconSearch size={16} color={c.textMuted} />
      <TextInput style={[s.searchInput, { color: c.text }]} placeholder={t('ph-search-chats')} placeholderTextColor={c.textMuted}
        value={search} onChangeText={setSearch} accessibilityLabel={t('ph-search-chats')} />
    </View>
  );

  const { rooms, dms } = sections(list.entries, search);
  const section = (label: string, entries: ChatEntry[]) => entries.length > 0 && (
    <View style={s.section}>
      <Text style={[s.sectionLabel, { color: c.textMuted }]}>{label}</Text>
      {entries.map((entry) => (
        <ChatRow
          key={entry.key}
          entry={entry}
          me={me?.username}
          active={entry.key === p.selected}
          onPress={() => (entry.kind === 'room' && entry.needsPassword
            ? setAskPassword({ name: entry.key, hasPassword: !!entry.hasPassword, needsPassword: true })
            : open(entry))}
          onMenu={({ x, y }) => setRowMenu({ entry, at: { top: y + 12, left: x - 8 } })}
          onPin={() => list.setPref(entry.key, { pinned: !entry.pinned })}
          onMute={() => list.setPref(entry.key, { muted: !entry.muted })}
          onCloseDm={() => closeDm(entry.key)}
          swiped={swiped === entry.key}
          onSwipedChange={(isOpen) => setSwiped(isOpen ? entry.key : null)}
        />
      ))}
    </View>
  );

  return (
    <View style={s.container}>
      {p.sidebarHeader ? (
        <>
          <View style={s.sidebarHeader}>
            <DisplayText style={[s.sidebarTitle, { color: c.text }]}>{t('nav-chats')}</DisplayText>
            {!me?.guest && (
              <TouchableOpacity ref={plusButton} style={[s.plus, { backgroundColor: c.accentBg }]} activeOpacity={0.7}
                onPress={() => openNewChatMenu()}
                accessibilityLabel={`${t('create-room')} / ${t('find-room')}`}>
                <IconPlus size={18} color={c.accent} />
              </TouchableOpacity>
            )}
          </View>
          <View style={s.searchRow}>{searchBox}</View>
        </>
      ) : (
        <View style={s.topBar}>{searchBox}</View>
      )}

      {list.loading && <ActivityIndicator size="small" color={c.accent} style={{ marginTop: 24 }} />}
      <ScrollView contentContainerStyle={s.scroll}>
        <PushPrompt />
        {section(t('section-rooms'), rooms)}
        {section(t('section-dms'), dms)}
      </ScrollView>

      <Menu anchor={newChatAt} items={newChatItems} onClose={() => setNewChatAt(null)} />
      <Menu anchor={rowMenu?.at ?? null} items={rowMenu ? rowMenuItems(rowMenu.entry) : []} onClose={() => setRowMenu(null)} />
      <CreateRoomDialog visible={dialog === 'create'} onClose={() => setDialog(null)}
        onCreated={(room, password) => enterRoom(room, password || undefined)} />
      <FindRoomDialog visible={dialog === 'find'} onClose={() => setDialog(null)} onFound={(room, password) => enterRoom(room, password)} />
      <RoomPasswordDialog room={askPassword} onClose={() => setAskPassword(null)}
        onSubmit={(room, password) => enterRoom(room, password)} />
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
  plus: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchRow: { paddingHorizontal: 14, paddingBottom: 10 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 14, paddingVertical: 10 },
  // flexGrow, not flex: in the sidebar's column a flex basis of 0 would squash the height
  search: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 14, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, outlineStyle: 'none' } as any,
  scroll: { paddingHorizontal: 10, paddingBottom: Spacing.lg },
  section: { gap: 2, marginTop: 6 },
  sectionLabel: {
    fontSize: 12, fontWeight: String(Fonts.heavy) as any, letterSpacing: 0.6, textTransform: 'uppercase',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
});

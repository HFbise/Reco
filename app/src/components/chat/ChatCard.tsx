import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { getSocket } from '../../lib/socket';
import { showAlert } from '../../lib/alert';
import { LOBBY_ID } from '../../lib/i18n';
import { imageUrl } from '../../lib/images';
import { formatMsgTime } from '../../lib/time';
import { useBlockStore } from '../../store/blockStore';
import { AvatarView } from '../AvatarView';
import { Sheet } from '../ui/Sheet';
import { Button, IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { TextField } from '../ui/TextField';
import { ImageViewer } from './ImageViewer';
import { BansView, InfoView, JOIN_MODE_LABEL, JoinView, LogView, type RoomDetails } from './RoomAdminViews';
import {
  IconBan, IconBell, IconBellOff, IconChevronLeft, IconClose, IconFlag, IconHash, IconImage, IconInfo, IconLock,
  IconLogout, IconPin, IconSearch, IconShield, IconTrash, IconUserPlus,
} from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { RoomInfo } from '../../hooks/useRoomChat';
import type { DmMeta } from './types';
import { Fonts, Radius, Spacing } from '../../theme';

type CardView = 'main' | 'search' | 'photos' | 'info' | 'join' | 'bans' | 'log';

interface SearchHit { id: number; username: string; screenname: string; text: string; time: string }
interface Photo { message_id: number; image: { id: string; w: number; h: number }; username: string; screenname: string; time: string }

interface Props {
  visible: boolean;
  /** Room name, or a DM id ("dm:alice:bob") */
  name: string;
  dmMeta?: DmMeta | null;
  room: RoomInfo;
  isGuest: boolean;
  onClose: () => void;
  onLeave: () => void;
  /** Owner only: delete the room for everyone */
  onCloseRoom: () => void;
  onCopied: () => void;
  /** A search result was chosen: show that message in the chat */
  onJumpTo: (messageId: number) => void;
}

/** A chat's card (like a QQ group's settings or a Discord server's sheet): who and what it is,
 *  your own settings for it (pin, mute), its history (search, photos), and leaving. Rooms and
 *  DMs alike; the owner's controls only show for the owner. */
export function ChatCard(p: Props) {
  const c = useColors();
  const t = useT();
  const isDm = p.name.startsWith('dm:');
  const [view, setView] = useState<CardView>('main');
  const [prefs, setPrefs] = useState({ pinned: false, muted: false });
  const [details, setDetails] = useState<RoomDetails | null>(null);

  useEffect(() => {
    if (!p.visible) return;
    setView('main');
    const socket = getSocket();
    const onPref = (data: { room: string; pinned: boolean; muted: boolean }) => {
      if (data.room === p.name) setPrefs({ pinned: data.pinned, muted: data.muted });
    };
    const onDetails = (data: RoomDetails) => { if (data.room === p.name) setDetails(data); };
    socket.on('chat_pref', onPref);
    socket.on('room_details', onDetails);
    if (!p.isGuest) socket.emit('get_chat_pref', { room: p.name });
    if (!isDm) socket.emit('get_room_details', { room: p.name });
    return () => {
      socket.off('chat_pref', onPref);
      socket.off('room_details', onDetails);
    };
  }, [p.visible, p.name, p.isGuest, isDm]);

  function setPref(patch: Partial<typeof prefs>) {
    setPrefs((cur) => ({ ...cur, ...patch }));
    getSocket().emit('set_chat_pref', { room: p.name, ...patch });
  }

  return (
    <Sheet visible={p.visible} onClose={p.onClose} accessibilityLabel={t('close')}>
      {view === 'main' && (
        <Main {...p} isDm={isDm} prefs={prefs} setPref={setPref} openView={setView} details={details} />
      )}
      {view === 'search' && (
        <SearchView room={p.name} onBack={() => setView('main')}
          onPick={(id) => { p.onClose(); p.onJumpTo(id); }} />
      )}
      {view === 'photos' && <PhotosView room={p.name} onBack={() => setView('main')} />}
      {view === 'info' && <InfoView room={p.name} details={details} onBack={() => setView('main')} />}
      {view === 'join' && <JoinView room={p.name} details={details} onBack={() => setView('main')} />}
      {view === 'bans' && <BansView room={p.name} onBack={() => setView('main')} />}
      {view === 'log' && <LogView room={p.name} onBack={() => setView('main')} />}
    </Sheet>
  );
}

// ── the card itself ───────────────────────────────────────────

function Main(p: Props & {
  isDm: boolean;
  prefs: { pinned: boolean; muted: boolean };
  setPref: (patch: { pinned?: boolean; muted?: boolean }) => void;
  openView: (v: CardView) => void;
  details: RoomDetails | null;
}) {
  const c = useColors();
  const t = useT();
  const isLobby = p.name === LOBBY_ID;
  const isOwner = p.room.myLevel >= 2;
  const isAdmin = p.room.myLevel >= 1;
  const announcement = p.details?.announcement;

  function copyCode() {
    if (Platform.OS === 'web') navigator.clipboard?.writeText(p.room.code);
    p.onCopied();
  }

  function confirmCloseRoom() {
    showAlert(t('close-room'), t('close-room-confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('close-room'), style: 'destructive', onPress: p.onCloseRoom },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={s.body}>
      <View style={s.headerRow}>
        {p.isDm && p.dmMeta ? (
          <AvatarView expression={p.dmMeta.avatarExpression} color={p.dmMeta.avatarColor}
            username={p.dmMeta.username} screenname={p.dmMeta.screenname} size={60} />
        ) : (
          <View style={[s.roomTile, { backgroundColor: c.accentBg }]}><IconHash size={28} color={c.accent} /></View>
        )}
        <View style={s.headerText}>
          <DisplayText style={[s.title, { color: c.text }]} numberOfLines={2}>
            {p.isDm ? (p.dmMeta?.screenname ?? p.name) : t.room(p.name)}
          </DisplayText>
          <Text style={[s.subtitle, { color: c.textSub }]} numberOfLines={1}>
            {p.isDm
              ? `@${p.dmMeta?.username ?? ''}`
              : [t(p.room.memberCount === 1 ? 'header-member-one' : 'header-members', { n: p.room.memberCount }),
                p.room.code && `${t('room-code')} ${p.room.code}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <IconButton label={t('close')} onPress={p.onClose} size={40} round icon={(color) => <IconClose size={16} color={color} />} />
      </View>

      {!!p.details?.description && (
        <Text style={[s.description, { color: c.text }]}>{p.details.description}</Text>
      )}
      {announcement && (
        <View style={[s.announcement, { backgroundColor: c.accentBg }]} accessibilityLabel={t('announcement')}>
          <View style={s.announcementHead}>
            <IconFlag size={14} color={c.accentText} />
            <Text style={[s.announcementTitle, { color: c.accentText }]}>{t('announcement')}</Text>
          </View>
          <Text style={[s.announcementText, { color: c.text }]}>{announcement.text}</Text>
          {!!announcement.by && (
            <Text style={[s.announcementMeta, { color: c.textSub }]}>
              {announcement.by}{announcement.time ? ` · ${formatMsgTime(announcement.time, t.monthDay)}` : ''}
            </Text>
          )}
        </View>
      )}

      {/* One tap for the common things */}
      <View style={s.quick}>
        {!p.isDm && !p.isGuest && !!p.room.code && (
          <Quick label={t('invite')} onPress={copyCode} icon={<IconUserPlus size={20} color={c.accent} />} />
        )}
        {!p.isGuest && (
          <Quick label={p.prefs.muted ? t('muted-chat') : t('notifications')} active={p.prefs.muted}
            onPress={() => p.setPref({ muted: !p.prefs.muted })}
            icon={p.prefs.muted ? <IconBellOff size={20} color={c.sunnyText} /> : <IconBell size={20} color={c.accent} />} />
        )}
        <Quick label={t('search')} onPress={() => p.openView('search')} icon={<IconSearch size={20} color={c.accent} />} />
        <Quick label={t('photos')} onPress={() => p.openView('photos')} icon={<IconImage size={20} color={c.accent} />} />
      </View>

      {!p.isGuest && (
        <View style={[s.group, { backgroundColor: c.surface2 }]}>
          <ToggleRow label={t('pin-chat')} hint={t('pin-chat-hint')} icon={<IconPin size={17} color={c.textSub} />}
            value={p.prefs.pinned} onChange={(v) => p.setPref({ pinned: v })} />
          <View style={[s.divider, { backgroundColor: c.border }]} />
          <ToggleRow label={t('mute-notifications')} hint={t('mute-notifications-hint')} icon={<IconBellOff size={17} color={c.textSub} />}
            value={p.prefs.muted} onChange={(v) => p.setPref({ muted: v })} />
        </View>
      )}

      {!p.isDm && isAdmin && (
        <View style={[s.group, { backgroundColor: c.surface2 }]}>
          <Text style={[s.groupTitle, s.groupTitleInset, { color: c.textSub }]}>{t('room-settings')}</Text>
          <NavRow label={t('info-edit')} icon={<IconInfo size={17} color={c.textSub} />} onPress={() => p.openView('info')} />
          {isOwner && !isLobby && (
            <>
              <View style={[s.divider, { backgroundColor: c.border }]} />
              <NavRow label={t('join-mode')} value={p.details ? t(JOIN_MODE_LABEL[p.details.join_mode]) : ''}
                icon={<IconLock size={16} color={c.textSub} />} onPress={() => p.openView('join')} />
            </>
          )}
          <View style={[s.divider, { backgroundColor: c.border }]} />
          <NavRow label={t('ban-list')} icon={<IconBan size={17} color={c.textSub} />} onPress={() => p.openView('bans')} />
          <View style={[s.divider, { backgroundColor: c.border }]} />
          <NavRow label={t('mod-log')} icon={<IconShield size={17} color={c.textSub} />} onPress={() => p.openView('log')} />
        </View>
      )}

      {!p.isDm && !p.isGuest && !isLobby && (
        <TouchableOpacity style={[s.dangerRow, { backgroundColor: c.dangerBg }]} activeOpacity={0.8} accessibilityRole="button"
          onPress={isOwner ? confirmCloseRoom : p.onLeave}>
          {isOwner ? <IconTrash size={17} color={c.danger} /> : <IconLogout size={17} color={c.danger} />}
          <Text style={[s.dangerText, { color: c.danger }]}>{isOwner ? t('close-room') : t('leave-room')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function Quick({ label, icon, onPress, active }: { label: string; icon: ReactNode; onPress: () => void; active?: boolean }) {
  const c = useColors();
  return (
    <TouchableOpacity style={s.quickItem} onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.quickIcon, { backgroundColor: active ? c.sunny : c.accentBg }]}>{icon}</View>
      <Text style={[s.quickLabel, { color: c.textSub }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function ToggleRow({ label, hint, icon, value, onChange }: {
  label: string; hint: string; icon: ReactNode; value: boolean; onChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: c.surface }]}>{icon}</View>
      <View style={s.rowText}>
        <Text style={[s.rowLabel, { color: c.text }]}>{label}</Text>
        <Text style={[s.rowHint, { color: c.textMuted }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} thumbColor={c.onAccent}
        trackColor={{ false: c.border, true: c.accent }} {...({ activeThumbColor: c.onAccent } as any)} />
    </View>
  );
}

function NavRow({ label, value, icon, onPress }: { label: string; value?: string; icon: ReactNode; onPress: () => void }) {
  const c = useColors();
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[s.rowIcon, { backgroundColor: c.surface }]}>{icon}</View>
      <Text style={[s.rowLabel, s.rowText, { color: c.text }]}>{label}</Text>
      {!!value && <Text style={[s.rowValue, { color: c.textSub }]}>{value}</Text>}
      <View style={{ transform: [{ rotate: '180deg' }] }}><IconChevronLeft size={16} color={c.textMuted} /></View>
    </TouchableOpacity>
  );
}

// ── search ────────────────────────────────────────────────────

const SEARCH_DELAY_MS = 300;

function SearchView({ room, onBack, onPick }: { room: string; onBack: () => void; onPick: (id: number) => void }) {
  const c = useColors();
  const t = useT();
  const blocked = new Set(useBlockStore((st) => st.blocked));
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const asked = useRef('');
  const loadingMore = useRef(false); // the next answer adds to the list instead of replacing it

  useEffect(() => {
    const socket = getSocket();
    const onResults = (data: { room: string; q: string; results: SearchHit[]; has_more: boolean }) => {
      if (data.room !== room || data.q !== asked.current) return; // an older, slower answer
      setBusy(false);
      setHits((cur) => (loadingMore.current ? [...cur, ...data.results] : data.results));
      setHasMore(data.has_more);
      loadingMore.current = false;
    };
    socket.on('search_results', onResults);
    return () => { socket.off('search_results', onResults); };
  }, [room]);

  useEffect(() => {
    const q = query.trim();
    asked.current = q;
    if (!q) { setHits([]); setHasMore(false); setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => getSocket().emit('search_messages', { room, q }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, room]);

  function more() {
    const last = hits[hits.length - 1];
    if (!last) return;
    loadingMore.current = true;
    setBusy(true);
    getSocket().emit('search_messages', { room, q: asked.current, before_id: last.id });
  }

  const shown = hits.filter((h) => !blocked.has(h.username));

  return (
    <View style={s.subview}>
      <View style={s.subHeader}>
        <IconButton label={t('back')} onPress={onBack} size={40} round icon={(color) => <IconChevronLeft size={18} color={color} />} />
        <TextField value={query} onChangeText={setQuery} placeholder={t('search-messages')} autoFocus
          style={s.searchField} accessibilityLabel={t('search-messages')} />
      </View>
      <ScrollView contentContainerStyle={s.results} keyboardShouldPersistTaps="handled">
        {!query.trim() ? (
          <Text style={[s.empty, { color: c.textMuted }]}>{t('search-hint')}</Text>
        ) : busy && hits.length === 0 ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
        ) : shown.length === 0 ? (
          <Text style={[s.empty, { color: c.textMuted }]}>{t('search-none')}</Text>
        ) : (
          shown.map((h) => (
            <TouchableOpacity key={h.id} style={[s.hit, { borderBottomColor: c.border }]} activeOpacity={0.7}
              onPress={() => onPick(h.id)} accessibilityRole="button">
              <View style={s.hitHead}>
                <Text style={[s.hitName, { color: c.text }]} numberOfLines={1}>{h.screenname}</Text>
                <Text style={[s.hitTime, { color: c.textMuted }]}>{formatMsgTime(h.time, t.monthDay)}</Text>
              </View>
              <Highlighted text={h.text} query={asked.current} />
            </TouchableOpacity>
          ))
        )}
        {hasMore && shown.length > 0 && (
          <Button variant="quiet" label={t('load-older')} onPress={more} busy={busy} style={{ marginTop: 8 }} />
        )}
      </ScrollView>
    </View>
  );
}

/** The message text with every match of `query` in bold. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const c = useColors();
  const parts: { s: string; hit: boolean }[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let at = 0;
  while (q && at < text.length) {
    const i = lower.indexOf(q, at);
    if (i === -1) break;
    if (i > at) parts.push({ s: text.slice(at, i), hit: false });
    parts.push({ s: text.slice(i, i + q.length), hit: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ s: text.slice(at), hit: false });
  return (
    <Text style={[s.hitText, { color: c.textSub }]} numberOfLines={3}>
      {parts.map((part, i) => (
        <Text key={i} style={part.hit ? [s.hitMark, { color: c.text, backgroundColor: c.accentBg }] : undefined}>{part.s}</Text>
      ))}
    </Text>
  );
}

// ── photos ────────────────────────────────────────────────────

function PhotosView({ room, onBack }: { room: string; onBack: () => void }) {
  const c = useColors();
  const t = useT();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState<Photo['image'] | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    const onPhotos = (data: { room: string; photos: Photo[]; has_more: boolean }) => {
      if (data.room !== room) return;
      setPhotos((cur) => [...(cur ?? []), ...data.photos]);
      setHasMore(data.has_more);
    };
    socket.on('chat_photos', onPhotos);
    socket.emit('get_chat_photos', { room });
    return () => { socket.off('chat_photos', onPhotos); };
  }, [room]);

  const tile = width ? Math.floor((width - 2 * GAP) / 3) : 0;

  return (
    <View style={s.subview}>
      <View style={s.subHeader}>
        <IconButton label={t('back')} onPress={onBack} size={40} round icon={(color) => <IconChevronLeft size={18} color={color} />} />
        <DisplayText style={[s.subTitle, { color: c.text }]}>{t('photos')}</DisplayText>
      </View>
      <ScrollView contentContainerStyle={s.results}>
        <View style={s.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {photos === null ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 24, flex: 1 }} />
          ) : photos.length === 0 ? (
            <Text style={[s.empty, { color: c.textMuted, flex: 1 }]}>{t('photos-none')}</Text>
          ) : tile > 0 && photos.map((ph) => (
            <TouchableOpacity key={ph.message_id} onPress={() => setOpen(ph.image)} activeOpacity={0.85}
              accessibilityRole="imagebutton" accessibilityLabel={`${t('photo')}: ${ph.screenname}`}>
              <Image source={{ uri: imageUrl(ph.image.id) }} style={{ width: tile, height: tile, borderRadius: 8, backgroundColor: c.surface2 }} />
            </TouchableOpacity>
          ))}
        </View>
        {hasMore && photos && (
          <Button variant="quiet" label={t('load-older')} style={{ marginTop: 10 }}
            onPress={() => getSocket().emit('get_chat_photos', { room, before_id: photos[photos.length - 1].message_id })} />
        )}
      </ScrollView>
      {open && <ImageViewer image={open} onClose={() => setOpen(null)} />}
    </View>
  );
}

const GAP = 4;

const s = StyleSheet.create({
  body: { padding: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  roomTile: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 22, lineHeight: 27 },
  subtitle: { fontSize: 13 },
  quick: { flexDirection: 'row', justifyContent: 'space-around' },
  quickItem: { alignItems: 'center', gap: 6, width: 72 },
  quickIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: String(Fonts.bold) as any },
  group: { borderRadius: Radius.xl, paddingVertical: 4 },
  groupPad: { padding: 14, gap: 10 },
  groupTitle: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  groupTitleInset: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  rowValue: { fontSize: 13 },
  description: { fontSize: 15, lineHeight: 22 },
  announcement: { borderRadius: Radius.lg, padding: 14, gap: 6 },
  announcementHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  announcementTitle: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  announcementText: { fontSize: 15, lineHeight: 22 },
  announcementMeta: { fontSize: 12 },
  divider: { height: 1, marginLeft: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  rowHint: { fontSize: 12 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: Radius.lg },
  dangerText: { fontSize: 15, fontWeight: String(Fonts.heavy) as any },
  subview: { height: 560, maxHeight: '100%' },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  subTitle: { fontSize: 20 },
  searchField: { flex: 1 },
  results: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  empty: { textAlign: 'center', marginTop: 28, fontSize: 14 },
  hit: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 3 },
  hitHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  hitName: { fontSize: 14, fontWeight: String(Fonts.heavy) as any, flexShrink: 1 },
  hitTime: { fontSize: 12 },
  hitText: { fontSize: 14, lineHeight: 20 },
  hitMark: { fontWeight: String(Fonts.heavy) as any, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});

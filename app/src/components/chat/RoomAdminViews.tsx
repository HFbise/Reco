import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getSocket } from '../../lib/socket';
import { request } from '../../lib/account';
import { Button, IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { TextField } from '../ui/TextField';
import { IconCheck, IconChevronLeft } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import type { I18nKey } from '../../lib/i18n';
import { Fonts, Radius, Spacing } from '../../theme';

// The room card's pages for a room's owner and admins (handlers/room_admin.py on the server)

export type JoinMode = 'open' | 'password' | 'invite';

export interface RoomDetails {
  room: string;
  description: string;
  announcement: { text: string; by: string | null; time: string | null } | null;
  join_mode: JoinMode;
}

export const JOIN_MODE_LABEL: Record<JoinMode, I18nKey> = {
  open: 'join-open', password: 'join-password', invite: 'join-invite',
};

const DURATION_LABEL: Record<number, I18nKey> = {
  0: 'duration-forever', 60: 'duration-1m', 300: 'duration-5m', 600: 'duration-10m',
  1800: 'duration-30m', 3600: 'duration-1h', 86400: 'duration-1d',
};

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  const c = useColors();
  const t = useT();
  return (
    <View style={s.page}>
      <View style={s.head}>
        <IconButton label={t('back')} onPress={onBack} size={40} round icon={(color) => <IconChevronLeft size={18} color={color} />} />
        <DisplayText style={[s.title, { color: c.text }]} numberOfLines={1}>{title}</DisplayText>
      </View>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[s.label, { color: c.textSub }]}>{children}</Text>;
}

function ErrorText({ text }: { text: string }) {
  const c = useColors();
  return text ? <Text style={[s.error, { color: c.danger }]}>{text}</Text> : null;
}

// ── description and announcement ──────────────────────────────

export function InfoView({ room, details, onBack }: { room: string; details: RoomDetails | null; onBack: () => void }) {
  const t = useT();
  const [description, setDescription] = useState(details?.description ?? '');
  const [announcement, setAnnouncement] = useState(details?.announcement?.text ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const reply = await request('update_room_info', { room, description, announcement }, 'update_room_info_result');
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-save-failed')); return; }
    onBack();
  }

  return (
    <Page title={t('info-edit')} onBack={onBack}>
      <Label>{t('description')}</Label>
      <TextField value={description} onChangeText={setDescription} placeholder={t('ph-description')}
        multiline maxLength={300} style={s.multiline} accessibilityLabel={t('description')} />
      <Label>{t('announcement')}</Label>
      <TextField value={announcement} onChangeText={setAnnouncement} placeholder={t('ph-announcement')}
        multiline maxLength={1000} style={[s.multiline, { minHeight: 120 }]} accessibilityLabel={t('announcement')} />
      <ErrorText text={error} />
      <Button label={t('save')} onPress={save} busy={busy} />
    </Page>
  );
}

// ── who can join ──────────────────────────────────────────────

export function JoinView({ room, details, onBack }: { room: string; details: RoomDetails | null; onBack: () => void }) {
  const c = useColors();
  const t = useT();
  const current = details?.join_mode ?? 'open';
  const [mode, setMode] = useState<JoinMode>(current);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (mode === 'password' && current !== 'password' && !password.trim()) { setError(t('err-pw-required')); return; }
    setBusy(true);
    const reply = await request('set_join_mode', { room, mode, password: password.trim() }, 'set_join_mode_result');
    setBusy(false);
    if (!reply.success) { setError(t.server(reply, 'err-save-failed')); return; }
    onBack();
  }

  const hints: Record<JoinMode, I18nKey> = { open: 'join-open-hint', password: 'join-password-hint', invite: 'join-invite-hint' };
  return (
    <Page title={t('join-mode')} onBack={onBack}>
      <View style={[s.group, { backgroundColor: c.surface2 }]} accessibilityRole="radiogroup">
        {(['open', 'password', 'invite'] as const).map((m, i) => (
          <View key={m}>
            {i > 0 && <View style={[s.divider, { backgroundColor: c.border }]} />}
            <TouchableOpacity style={s.option} onPress={() => { setMode(m); setError(''); }} activeOpacity={0.75}
              accessibilityRole="radio" accessibilityState={{ checked: mode === m }} accessibilityLabel={t(JOIN_MODE_LABEL[m])}>
              <View style={s.optionText}>
                <Text style={[s.optionLabel, { color: c.text }]}>{t(JOIN_MODE_LABEL[m])}</Text>
                <Text style={[s.optionHint, { color: c.textMuted }]}>{t(hints[m])}</Text>
              </View>
              <View style={[s.radio, { borderColor: mode === m ? c.accent : c.border, backgroundColor: mode === m ? c.accent : 'transparent' }]}>
                {mode === m && <IconCheck size={12} color={c.onAccent} />}
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {mode === 'password' && (
        <TextField value={password} onChangeText={setPassword} secureTextEntry
          placeholder={current === 'password' ? t('ph-new-room-pw-keep') : t('ph-set-room-pw')} />
      )}
      <ErrorText text={error} />
      <Button label={t('save')} onPress={save} busy={busy} />
    </Page>
  );
}

// ── ban list ──────────────────────────────────────────────────

interface Banned { username: string; screenname: string; until: string | null }
interface Bans { kicked: Banned[]; muted: Banned[]; voice_banned: Banned[] }

export function BansView({ room, onBack }: { room: string; onBack: () => void }) {
  const c = useColors();
  const t = useT();
  const [bans, setBans] = useState<Bans | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onBans = (data: Bans & { room: string; success: boolean }) => { if (data.room === room && data.success) setBans(data); };
    const reload = () => socket.emit('get_room_bans', { room });
    socket.on('room_bans', onBans);
    // Lifting a mute or voice ban is announced to the room; the list follows
    socket.on('text_unmuted', reload);
    socket.on('voice_unbanned', reload);
    reload();
    return () => {
      socket.off('room_bans', onBans);
      socket.off('text_unmuted', reload);
      socket.off('voice_unbanned', reload);
    };
  }, [room]);

  async function lift(kind: keyof Bans, username: string) {
    const socket = getSocket();
    if (kind === 'kicked') await request('unkick_member', { room, target: username }, 'unkick_result');
    else socket.emit(kind === 'muted' ? 'text_unmute' : 'voice_unban', { room, target: username });
    socket.emit('get_room_bans', { room });
  }

  const sections: [keyof Bans, I18nKey][] = [['kicked', 'bans-kicked'], ['muted', 'bans-muted'], ['voice_banned', 'bans-voice']];
  const empty = bans && sections.every(([k]) => bans[k].length === 0);
  return (
    <Page title={t('ban-list')} onBack={onBack}>
      {!bans ? <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
        : empty ? <Text style={[s.empty, { color: c.textMuted }]}>{t('bans-none')}</Text>
        : sections.filter(([k]) => bans[k].length > 0).map(([kind, label]) => (
          <View key={kind} style={{ gap: 6 }}>
            <Label>{t(label)}</Label>
            <View style={[s.group, { backgroundColor: c.surface2 }]}>
              {bans[kind].map((p, i) => (
                <View key={p.username}>
                  {i > 0 && <View style={[s.divider, { backgroundColor: c.border }]} />}
                  <View style={s.option}>
                    <View style={s.optionText}>
                      <Text style={[s.optionLabel, { color: c.text }]} numberOfLines={1}>{p.screenname}</Text>
                      <Text style={[s.optionHint, { color: c.textMuted }]}>
                        {kind === 'kicked' ? `@${p.username}`
                          : p.until ? t('until', { time: t.when(p.until) }) : t('duration-forever')}
                      </Text>
                    </View>
                    <Button label={t('lift')} variant="quiet" onPress={() => lift(kind, p.username)} style={s.small}
                      accessibilityLabel={`${t('lift')} ${p.screenname}`} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
    </Page>
  );
}

// ── moderation log ────────────────────────────────────────────

interface LogEntry {
  id: number; actor: string; actor_name: string; action: string;
  target: string | null; target_name: string | null; detail: Record<string, any>; time: string;
}

export function LogView({ room, onBack }: { room: string; onBack: () => void }) {
  const c = useColors();
  const t = useT();
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const onLog = (data: { room: string; success: boolean; entries: LogEntry[]; has_more: boolean }) => {
      if (data.room !== room || !data.success) return;
      setEntries((cur) => [...(cur ?? []), ...data.entries]);
      setHasMore(data.has_more);
    };
    socket.on('room_log', onLog);
    socket.emit('get_room_log', { room });
    return () => { socket.off('room_log', onLog); };
  }, [room]);

  function describe(e: LogEntry): string {
    const actor = e.actor === 'admin' ? t('site-admin') : e.actor_name;
    const duration = typeof e.detail.duration === 'number'
      ? (DURATION_LABEL[e.detail.duration] ? t(DURATION_LABEL[e.detail.duration]) : `${Math.round(e.detail.duration / 60)} min`)
      : '';
    const mode = e.detail.mode in JOIN_MODE_LABEL ? t(JOIN_MODE_LABEL[e.detail.mode as JoinMode]) : '';
    const key = `log-${e.action}` as I18nKey;
    return t(key, { actor, target: e.target_name ?? '', duration, mode });
  }

  return (
    <Page title={t('mod-log')} onBack={onBack}>
      {entries === null ? <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
        : entries.length === 0 ? <Text style={[s.empty, { color: c.textMuted }]}>{t('log-none')}</Text>
        : entries.map((e) => (
          <View key={e.id} style={[s.logRow, { borderBottomColor: c.border }]}>
            <Text style={[s.logText, { color: c.text }]}>{describe(e)}</Text>
            {!!e.detail.text && <Text style={[s.logQuote, { color: c.textSub }]} numberOfLines={2}>“{e.detail.text}”</Text>}
            <Text style={[s.logTime, { color: c.textMuted }]}>{t.when(e.time)}</Text>
          </View>
        ))}
      {hasMore && entries && (
        <Button variant="quiet" label={t('load-older')}
          onPress={() => getSocket().emit('get_room_log', { room, before_id: entries[entries.length - 1].id })} />
      )}
    </Page>
  );
}

const s = StyleSheet.create({
  page: { height: 560, maxHeight: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  title: { fontSize: 20, flex: 1 },
  body: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 10 },
  label: { fontSize: 13, fontWeight: String(Fonts.heavy) as any, marginTop: 4, marginLeft: 4 },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  error: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  group: { borderRadius: Radius.xl, paddingVertical: 2 },
  divider: { height: 1, marginHorizontal: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  optionHint: { fontSize: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 34, paddingHorizontal: 12 },
  empty: { textAlign: 'center', marginTop: 28, fontSize: 14 },
  logRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  logText: { fontSize: 14, lineHeight: 20 },
  logQuote: { fontSize: 13, fontStyle: 'italic' },
  logTime: { fontSize: 12 },
});

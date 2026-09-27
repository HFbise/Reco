import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, Platform, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { AvatarView } from '../AvatarView';
import { MessageBubble, type Message } from '../MessageBubble';
import { IconChat, IconMic, IconMicOff, IconSend, IconShuffle } from '../Icon';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useMatch, type MatchMode, type Revealed } from '../../hooks/useMatch';
import { useMatchVoice } from '../../hooks/useMatchVoice';
import { showAlert } from '../../lib/alert';
import { MAX_TAGS, RELAX_AFTER_MS, TAG_CATEGORIES, knownTags, toggleTag } from '../../lib/matchTags';
import type { I18nKey } from '../../lib/i18n';
import { Fonts, Radius, Spacing } from '../../theme';

interface Props {
  /** Both people chose "keep in touch": open the new DM */
  onOpenDm: (revealed: Revealed) => void;
}

/** Random matching: pick a mode and interests → wait → chat with a stranger → next. */
export function MatchView({ onOpenDm }: Props) {
  const c = useColors();
  const t = useT();
  const match = useMatch();
  const voice = useMatchVoice(match.matchId, match.phase === 'matched' && match.mode === 'voice', match.initiator);

  if (match.phase === 'idle') return <MatchStart onStart={match.start} lastMode={match.mode} lastTags={match.tags} />;
  if (match.phase === 'searching') return <Searching tags={match.tags} since={match.searchingSince} onCancel={match.cancel} />;

  const ended = match.phase === 'ended';
  const endedText = match.endReason === 'reported' ? t('match-ended-reported')
    : match.endReason === 'you_left' ? t('match-ended-you') : t('match-ended-partner');

  function confirmReport() {
    showAlert(t('match-report'), t('match-report-confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('match-report'), style: 'destructive', onPress: () => match.report('') },
    ]);
  }

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      {/* who you're talking to: just "Stranger" and what you have in common */}
      <View style={[s.header, { borderBottomColor: c.border, backgroundColor: c.bg }]}>
        <AvatarView expression={match.stranger?.expression} color={match.stranger?.color} size={32} />
        <View style={s.headerText}>
          <Text style={[s.headerName, { color: c.text }]}>{t('stranger')}</Text>
          {match.sharedTags.length > 0 && (
            <Text style={[s.headerSub, { color: c.textMuted }]} numberOfLines={1}>
              {t('match-shared')}: {match.sharedTags.map(t.tag).join(' · ')}
            </Text>
          )}
        </View>
        {!ended && (
          <View style={s.headerActions}>
            <TouchableOpacity style={[s.pill, { borderColor: c.border }]} onPress={confirmReport} activeOpacity={0.8}>
              <Text style={[s.pillText, { color: c.danger }]}>{t('match-report')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.pill, { borderColor: c.border }]} onPress={match.leave} activeOpacity={0.8}>
              <Text style={[s.pillText, { color: c.text }]}>{t('match-leave')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.pill, { backgroundColor: c.accent, borderColor: c.accent }]} onPress={match.next} activeOpacity={0.85}>
              <Text style={[s.pillText, { color: '#fff' }]}>{t('match-next')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {match.mode === 'voice' && !ended && <VoiceStrip status={voice.status} muted={voice.muted} onToggleMute={voice.toggleMute} />}

      {match.revealed && (
        <View style={[s.banner, { backgroundColor: c.accentBg }]}>
          <Text style={[s.bannerText, { color: c.text }]}>{t('match-revealed', { name: match.revealed.screenname })}</Text>
          <TouchableOpacity style={[s.pill, { backgroundColor: c.accent, borderColor: c.accent }]}
            onPress={() => onOpenDm(match.revealed!)} activeOpacity={0.85}>
            <Text style={[s.pillText, { color: '#fff' }]}>{t('match-open-dm')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MatchMessages messages={match.messages} stranger={match.stranger} typing={match.strangerTyping} />
        {ended ? (
          <View style={[s.endedBar, { borderTopColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[s.endedText, { color: c.textMuted }]}>{endedText}</Text>
            <View style={s.row}>
              <TouchableOpacity style={[s.pill, { borderColor: c.border }]} onPress={match.backToStart} activeOpacity={0.8}>
                <Text style={[s.pillText, { color: c.text }]}>{t('match-back')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.pill, { backgroundColor: c.accent, borderColor: c.accent }]} onPress={match.next} activeOpacity={0.85}>
                <Text style={[s.pillText, { color: '#fff' }]}>{t('match-again')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <MatchComposer
            onSend={match.send}
            onTyping={match.typing}
            keepLabel={match.revealed ? null : match.keepRequested ? t('match-keep-waiting') : t('match-keep')}
            keepDisabled={match.keepRequested}
            onKeep={match.keep}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── idle: choose mode + interests ─────────────────────────────

function MatchStart({ onStart, lastMode, lastTags }: { onStart: (m: MatchMode, tags: string[]) => void; lastMode: MatchMode; lastTags: string[] }) {
  const c = useColors();
  const t = useT();
  const [mode, setMode] = useState<MatchMode>(lastMode);
  const [tags, setTags] = useState<string[]>(() => knownTags(lastTags));
  const [category, setCategory] = useState(TAG_CATEGORIES[0].id);
  const shown = TAG_CATEGORIES.find((x) => x.id === category) ?? TAG_CATEGORIES[0];
  const full = tags.length >= MAX_TAGS;

  const modeBtn = (value: MatchMode, label: string) => (
    <TouchableOpacity key={value} onPress={() => setMode(value)} activeOpacity={0.85}
      style={[s.modeBtn, { borderColor: mode === value ? c.accent : c.border, backgroundColor: mode === value ? c.accentBg : c.surface }]}>
      {value === 'voice' ? <IconMic size={18} color={mode === value ? c.accent : c.textMuted} /> : <IconChat size={18} color={mode === value ? c.accent : c.textMuted} />}
      <Text style={[s.modeText, { color: mode === value ? c.accent : c.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={s.startScroll}>
      <View style={[s.startCard, { backgroundColor: c.surface }]}>
        <View style={[s.startIcon, { backgroundColor: c.accentBg }]}><IconShuffle size={28} color={c.accent} /></View>
        <Text style={[s.title, { color: c.text }]}>{t('match-title')}</Text>
        <Text style={[s.subtitle, { color: c.textMuted }]}>{t('match-subtitle')}</Text>
        <View style={s.row}>
          {modeBtn('text', t('match-text'))}
          {modeBtn('voice', t('match-voice'))}
        </View>

        <View style={[s.row, { marginTop: Spacing.sm }]}>
          <Text style={[s.label, { color: c.textMuted, flex: 1 }]}>{t('match-tags-label')}</Text>
          <Text style={[s.label, { color: full ? c.accent : c.textMuted }]}>{t('match-tags-count', { n: tags.length, max: MAX_TAGS })}</Text>
        </View>

        {/* categories */}
        <View style={s.catRow}>
          {TAG_CATEGORIES.map((cat) => {
            const on = cat.id === category;
            const picked = cat.tags.filter((tag) => tags.includes(tag)).length;
            return (
              <TouchableOpacity key={cat.id} onPress={() => setCategory(cat.id)} activeOpacity={0.8}
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={[s.catTab, { backgroundColor: on ? c.accent : c.bg }]}>
                <Text style={[s.catText, { color: on ? '#fff' : c.text }]}>{t(`tagcat-${cat.id}` as I18nKey)}</Text>
                {picked > 0 && (
                  <View style={[s.catBadge, { backgroundColor: on ? '#fff' : c.accent }]}>
                    <Text style={[s.catBadgeText, { color: on ? c.accent : '#fff' }]}>{picked}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* tags in the chosen category */}
        <View style={s.tagGrid}>
          {shown.tags.map((tag) => {
            const on = tags.includes(tag);
            const disabled = !on && full;
            return (
              <TouchableOpacity key={tag} onPress={() => setTags((prev) => toggleTag(prev, tag))} disabled={disabled}
                activeOpacity={0.75} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }}
                style={[s.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : 'transparent' },
                  disabled && { opacity: 0.4 }]}>
                <Text style={[s.chipText, { color: on ? '#fff' : c.text }]}>{t.tag(tag)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* everything picked so far, across categories */}
        {tags.length > 0 && (
          <View style={[s.picked, { borderTopColor: c.border }]}>
            {tags.map((tag) => (
              <TouchableOpacity key={tag} style={[s.pickedChip, { backgroundColor: c.accentBg }]}
                onPress={() => setTags((prev) => toggleTag(prev, tag))} activeOpacity={0.7}
                accessibilityLabel={`${t.tag(tag)} ×`}>
                <Text style={[s.pickedText, { color: c.accent }]}>{t.tag(tag)} ×</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={[s.startBtn, { backgroundColor: c.accent }]} activeOpacity={0.86} onPress={() => onStart(mode, tags)}>
          <Text style={s.startText}>{t('match-start')}</Text>
        </TouchableOpacity>
        <Text style={[s.note, { color: c.textMuted }]}>{t('match-private-note')}</Text>
      </View>
    </ScrollView>
  );
}

// ── searching ─────────────────────────────────────────────────

function Searching({ tags, since, onCancel }: { tags: string[]; since: number; onCancel: () => void }) {
  const c = useColors();
  const t = useT();
  const [widened, setWidened] = useState(false);
  useEffect(() => {
    setWidened(false);
    if (!tags.length) return;
    const timer = setTimeout(() => setWidened(true), Math.max(0, since + RELAX_AFTER_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [since, tags.length]);

  return (
    <View style={[s.fill, s.center, { backgroundColor: c.bg }]}>
      <ActivityIndicator size="large" color={c.accent} />
      <Text style={[s.searchText, { color: c.text }]}>
        {tags.length ? t('match-searching-tags', { tags: tags.map(t.tag).join(' · ') }) : t('match-searching')}
      </Text>
      {widened && <Text style={[s.subtitle, { color: c.textMuted }]}>{t('match-widening')}</Text>}
      <TouchableOpacity style={[s.pill, { borderColor: c.border, marginTop: Spacing.lg }]} onPress={onCancel} activeOpacity={0.8}>
        <Text style={[s.pillText, { color: c.text }]}>{t('cancel')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── chat ──────────────────────────────────────────────────────

function MatchMessages({ messages, stranger, typing }: {
  messages: ReturnType<typeof useMatch>['messages'];
  stranger: { expression: string; color: string } | null;
  typing: boolean;
}) {
  const c = useColors();
  const t = useT();
  const bubbles: Message[] = messages.map((m) => ({
    id: m.id,
    text: m.text,
    time: m.time,
    isOwn: m.from === 'me',
    username: m.from,
    screenname: m.from === 'me' ? '' : t('stranger'),
    avatar_expression: m.from === 'me' ? undefined : stranger?.expression,
    avatar_color: m.from === 'me' ? undefined : stranger?.color,
  }));
  if (!bubbles.length) {
    return (
      <View style={[s.fill, s.center]}>
        <Text style={[s.empty, { color: c.textMuted }]}>{typing ? t('match-typing') : t('match-empty')}</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={[...bubbles].reverse()}
      inverted
      keyExtractor={(m) => String(m.id)}
      renderItem={({ item }) => <MessageBubble msg={item} />}
      ListHeaderComponent={typing ? <Text style={[s.typing, { color: c.textMuted }]}>{t('match-typing')}</Text> : null}
      contentContainerStyle={s.list}
    />
  );
}

function MatchComposer({ onSend, onTyping, keepLabel, keepDisabled, onKeep }: {
  onSend: (text: string) => void;
  onTyping: () => void;
  keepLabel: string | null;
  keepDisabled: boolean;
  onKeep: () => void;
}) {
  const c = useColors();
  const t = useT();
  const [text, setText] = useState('');
  const lastTyping = useRef(0);

  function change(value: string) {
    setText(value);
    // at most one "typing" signal every 2s
    if (Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      onTyping();
    }
  }
  function send() {
    onSend(text);
    setText('');
  }

  return (
    <View style={[s.composer, { backgroundColor: c.bg }]}>
      {keepLabel && (
        <TouchableOpacity style={[s.keepBtn, { borderColor: c.accent }, keepDisabled && { opacity: 0.6 }]} onPress={onKeep}
          disabled={keepDisabled} activeOpacity={0.8}>
          <Text style={[s.keepText, { color: c.accent }]} numberOfLines={1}>{keepLabel}</Text>
        </TouchableOpacity>
      )}
      <View style={s.inputRow}>
        <TextInput
          style={[s.input, { backgroundColor: c.isDark ? 'rgba(255,255,255,0.08)' : '#e4e4e8', color: c.text }]}
          placeholder={t('ph-message')} placeholderTextColor={c.textMuted} value={text} onChangeText={change}
          onSubmitEditing={send} returnKeyType="send" multiline
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
              e.preventDefault?.();
              send();
            }
          }}
        />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: c.accent }, !text.trim() && { opacity: 0.45 }]} onPress={send} activeOpacity={0.8}>
          <IconSend size={17} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VoiceStrip({ status, muted, onToggleMute }: { status: string; muted: boolean; onToggleMute: () => void }) {
  const c = useColors();
  const t = useT();
  const label = {
    connecting: t('match-voice-connecting'),
    connected: t('match-voice-connected'),
    unavailable: t('match-voice-unavailable'),
    'mic-denied': t('match-voice-mic'),
    failed: t('match-voice-failed'),
    off: t('match-voice-connecting'),
  }[status];
  const bad = status === 'unavailable' || status === 'mic-denied' || status === 'failed';
  return (
    <View style={[s.voiceStrip, { backgroundColor: bad ? 'rgba(237,66,69,0.1)' : c.accentBg }]}>
      <IconMic size={15} color={bad ? c.danger : c.accent} />
      <Text style={[s.voiceText, { color: bad ? c.danger : c.accent }]}>{label}</Text>
      <View style={s.fill} />
      {status === 'connected' && (
        <TouchableOpacity style={s.row} onPress={onToggleMute} activeOpacity={0.7}>
          {muted ? <IconMicOff size={16} color={c.danger} /> : <IconMic size={16} color={c.text} />}
          <Text style={[s.voiceText, { color: c.text }]}>{muted ? t('match-unmute') : t('match-mute')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  startScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  startCard: { width: '100%', maxWidth: 520, borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch' },
  startIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: String(Fonts.bold) as any, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  note: { fontSize: 12, textAlign: 'center' },
  label: { fontSize: 12, fontWeight: String(Fonts.semibold) as any, marginTop: Spacing.sm },
  modeBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1.5 },
  modeText: { fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catTab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  catText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  catBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  catBadgeText: { fontSize: 11, fontWeight: String(Fonts.bold) as any },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md },
  pickedChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  pickedText: { fontSize: 12, fontWeight: String(Fonts.semibold) as any },
  startBtn: { borderRadius: Radius.md, padding: 13, alignItems: 'center', marginTop: Spacing.sm },
  startText: { color: '#fff', fontSize: 16, fontWeight: String(Fonts.bold) as any },
  searchText: { fontSize: 16, fontWeight: String(Fonts.semibold) as any, marginTop: Spacing.lg, textAlign: 'center' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, borderBottomWidth: 1 },
  headerText: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: String(Fonts.semibold) as any },
  headerSub: { fontSize: 12 },
  headerActions: { flexDirection: 'row', gap: 6 },
  pill: { borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, paddingHorizontal: Spacing.lg },
  bannerText: { flex: 1, fontSize: 13 },
  voiceStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 8 },
  voiceText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  list: { paddingVertical: Spacing.sm, flexGrow: 1 },
  typing: { fontSize: 12, fontStyle: 'italic', paddingHorizontal: Spacing.lg, paddingVertical: 4 },
  empty: { textAlign: 'center', fontSize: 14 },
  composer: { paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 14, gap: 8 },
  keepBtn: { alignSelf: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5 },
  keepText: { fontSize: 13, fontWeight: String(Fonts.semibold) as any },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, maxHeight: 120, outlineStyle: 'none' } as any,
  sendBtn: { borderRadius: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  endedBar: { borderTopWidth: StyleSheet.hairlineWidth, padding: Spacing.lg, gap: Spacing.md, alignItems: 'center' },
  endedText: { fontSize: 14 },
});

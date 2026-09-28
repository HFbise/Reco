import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Platform, KeyboardAvoidingView, ScrollView, Animated, Easing,
} from 'react-native';
import { AvatarView } from '../AvatarView';
import { MessageBubble, type Message } from '../MessageBubble';
import { Button, IconButton } from '../ui/Button';
import { DisplayText } from '../ui/DisplayText';
import { FaceRow } from '../ui/FaceRow';
import { isSendKey } from '../../lib/keys';
import {
  IconChat, IconCheck, IconClose, IconFlag, IconHandshake, IconLock, IconMic, IconMicOff, IconMore, IconNext, IconSend,
  IconShuffle, IconStop,
} from '../Icon';
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
  /** Page title (phone), shown only before a match */
  title?: ReactNode;
}

/** Random matching: pick a mode and interests → wait → chat with a stranger → next. */
export function MatchView({ onOpenDm, title }: Props) {
  const c = useColors();
  const t = useT();
  const match = useMatch();
  const voice = useMatchVoice(match.matchId, match.phase === 'matched' && match.mode === 'voice', match.initiator);
  const [menuOpen, setMenuOpen] = useState(false);

  if (match.phase === 'idle' || match.phase === 'searching') {
    return (
      <View style={[s.fill, { backgroundColor: c.bg }]}>
        {title}
        {match.phase === 'idle'
          ? <MatchStart onStart={match.start} lastMode={match.mode} lastTags={match.tags} />
          : <Searching tags={match.tags} since={match.searchingSince} onCancel={match.cancel} />}
      </View>
    );
  }

  const ended = match.phase === 'ended';
  const endedText = match.endReason === 'reported' ? t('match-ended-reported')
    : match.endReason === 'you_left' ? t('match-ended-you') : t('match-ended-partner');

  function confirmReport() {
    setMenuOpen(false);
    showAlert(t('match-report'), t('match-report-confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('match-report'), style: 'destructive', onPress: () => match.report('') },
    ]);
  }

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      {/* who you're talking to: just "Stranger" and what you have in common */}
      <View style={[s.header, { borderBottomColor: c.border, backgroundColor: c.surface }]}>
        <AvatarView expression={match.stranger?.expression} color={match.stranger?.color} size={44} />
        <View style={s.headerText}>
          <DisplayText style={[s.headerName, { color: c.text }]}>{t('stranger')}</DisplayText>
          {match.sharedTags.length > 0 && (
            <View style={s.sharedTags} accessibilityLabel={`${t('match-shared')}: ${match.sharedTags.map(t.tag).join(', ')}`}>
              {match.sharedTags.map((tag) => (
                <View key={tag} style={[s.sharedTag, { backgroundColor: c.accentBg }]}>
                  <Text style={[s.sharedTagText, { color: c.accentText }]}>{t.tag(tag)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {!ended && (
          <>
            <IconButton label={t('match-more')} onPress={() => setMenuOpen((v) => !v)} active={menuOpen}
              icon={(color) => <IconMore size={20} color={color} />} />
            <TouchableOpacity style={[s.nextBtn, { backgroundColor: c.text }]} onPress={match.next} activeOpacity={0.85}
              accessibilityRole="button">
              <Text style={[s.nextText, { color: c.bg }]}>{t('match-next')}</Text>
              <IconNext size={14} color={c.bg} />
            </TouchableOpacity>
          </>
        )}
        {menuOpen && !ended && (
          <View style={[s.menu, { backgroundColor: c.surface, borderColor: c.border }]}>
            <MenuItem label={t('match-leave')} icon={<IconStop size={16} color={c.text} />} color={c.text}
              onPress={() => { setMenuOpen(false); match.leave(); }} />
            <MenuItem label={t('match-report')} icon={<IconFlag size={16} color={c.danger} />} color={c.danger}
              onPress={confirmReport} />
          </View>
        )}
      </View>

      {match.mode === 'voice' && !ended && <VoiceStrip status={voice.status} muted={voice.muted} onToggleMute={voice.toggleMute} />}

      {match.revealed ? (
        <View style={[s.card, { backgroundColor: c.accentBg }]}>
          <View style={[s.cardIcon, { backgroundColor: c.accent }]}><IconChat size={20} color={c.onAccent} /></View>
          <Text style={[s.cardText, { color: c.accentText }]}>{t('match-revealed', { name: match.revealed.screenname })}</Text>
          <TouchableOpacity style={[s.cardBtn, { backgroundColor: c.accent }]} onPress={() => onOpenDm(match.revealed!)}
            activeOpacity={0.85} accessibilityRole="button">
            <Text style={[s.cardBtnText, { color: c.onAccent }]}>{t('match-open-dm')}</Text>
          </TouchableOpacity>
        </View>
      ) : !ended && (
        <View style={[s.card, { backgroundColor: c.sunnyBg }]}>
          <View style={[s.cardIcon, { backgroundColor: c.sunny }]}><IconHandshake size={20} color={c.sunnyText} /></View>
          <Text style={[s.cardText, { color: c.text }]}>{match.keepRequested ? t('match-keep-waiting') : t('match-keep-hint')}</Text>
          {!match.keepRequested && (
            <TouchableOpacity style={[s.cardBtn, { backgroundColor: c.sunny }]} onPress={match.keep}
              activeOpacity={0.85} accessibilityRole="button">
              <Text style={[s.cardBtnText, { color: c.sunnyText }]}>{t('match-keep')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MatchMessages messages={match.messages} stranger={match.stranger} typing={match.strangerTyping} />
        {ended ? (
          <View style={[s.ended, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.endedText, { color: c.textSub }]}>{endedText}</Text>
            <View style={s.endedActions}>
              <Button label={t('match-back')} variant="quiet" onPress={match.backToStart} style={s.grow} />
              <Button label={t('match-again')} onPress={match.next} style={s.grow}
                icon={(color) => <IconShuffle size={17} color={color} />} />
            </View>
          </View>
        ) : (
          <MatchComposer onSend={match.send} onTyping={match.typing} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function MenuItem({ label, icon, color, onPress }: { label: string; icon: ReactNode; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7} accessibilityRole="menuitem">
      {icon}
      <Text style={[s.menuText, { color }]}>{label}</Text>
    </TouchableOpacity>
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

  const modeBtn = (value: MatchMode, label: string) => {
    const on = mode === value;
    const color = on ? c.accentText : c.text;
    return (
      <TouchableOpacity key={value} onPress={() => setMode(value)} activeOpacity={0.85}
        accessibilityRole="radio" accessibilityState={{ checked: on }}
        style={[s.modeBtn, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accentBg : c.surface }]}>
        {value === 'voice' ? <IconMic size={18} color={color} /> : <IconChat size={18} color={color} />}
        <Text style={[s.modeText, { color }, on && s.heavy]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={s.startScroll}>
      <View style={s.startColumn}>
        <View style={[s.hero, { backgroundColor: c.surface }]}>
          <FaceRow gap={0} faces={[
            { expression: 'Em', color: '#EB459E', size: 54, tilt: -12 },
            { expression: 'Laugh', color: '#1A70D4', size: 70, overlap: -12, ring: c.surface },
            { expression: 'BigLaugh', color: '#FAA61A', size: 54, tilt: 12, overlap: -12 },
          ]} />
          <DisplayText style={[s.heroTitle, { color: c.text }]}>{t('match-title')}</DisplayText>
          <Text style={[s.heroSub, { color: c.textSub }]}>{t('match-subtitle')}</Text>
        </View>

        <View style={s.modes} accessibilityRole="radiogroup">
          {modeBtn('text', t('match-text'))}
          {modeBtn('voice', t('match-voice'))}
        </View>

        <View style={s.interests}>
          <View style={s.interestsHead}>
            <Text style={[s.interestsTitle, { color: c.text }]}>{t('match-interests')}</Text>
            <Text style={[s.interestsCount, { color: full ? c.accent : c.textSub }]}>{t('match-tags-count', { n: tags.length, max: MAX_TAGS })}</Text>
          </View>

          {/* categories */}
          <View style={s.wrap} accessibilityRole="tablist">
            {TAG_CATEGORIES.map((cat) => {
              const on = cat.id === category;
              const picked = cat.tags.filter((tag) => tags.includes(tag)).length;
              return (
                <TouchableOpacity key={cat.id} onPress={() => setCategory(cat.id)} activeOpacity={0.8}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={[s.catTab, { backgroundColor: on ? c.text : c.surface }]}>
                  <Text style={[s.catText, { color: on ? c.bg : c.text }, on && s.heavy]}>{t(`tagcat-${cat.id}` as I18nKey)}</Text>
                  {picked > 0 && (
                    <View style={[s.catBadge, { backgroundColor: on ? c.sunny : c.accent }]}>
                      <Text style={[s.catBadgeText, { color: on ? c.sunnyText : c.onAccent }]}>{picked}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* tags in the chosen category */}
          <View style={[s.tagPanel, { backgroundColor: c.surface }]}>
            {shown.tags.map((tag) => {
              const on = tags.includes(tag);
              const disabled = !on && full;
              return (
                <TouchableOpacity key={tag} onPress={() => setTags((prev) => toggleTag(prev, tag))} disabled={disabled}
                  activeOpacity={0.75} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }}
                  accessibilityLabel={t.tag(tag)}
                  style={[s.tag, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent : c.surface },
                    disabled && { opacity: 0.4 }]}>
                  {on && <IconCheck size={14} color={c.onAccent} />}
                  <Text style={[s.tagText, { color: on ? c.onAccent : c.text }, on && s.heavy]}>{t.tag(tag)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* everything picked so far, across categories */}
          {tags.length > 0 && (
            <View style={s.wrap}>
              {tags.map((tag) => (
                <TouchableOpacity key={tag} style={[s.picked, { backgroundColor: c.accentBg }]}
                  onPress={() => setTags((prev) => toggleTag(prev, tag))} activeOpacity={0.7}
                  accessibilityLabel={`${t.tag(tag)} ×`}>
                  <Text style={[s.pickedText, { color: c.accentText }]}>{t.tag(tag)}</Text>
                  <IconClose size={10} color={c.accentText} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={s.startActions}>
          <Button size="lg" label={t('match-start')} onPress={() => onStart(mode, tags)}
            icon={(color) => <IconShuffle size={20} color={color} />} />
          <View style={s.note}>
            <IconLock size={13} color={c.textSub} />
            <Text style={[s.noteText, { color: c.textSub }]}>{t('match-private-note')}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ── searching ─────────────────────────────────────────────────

function Searching({ tags, since, onCancel }: { tags: string[]; since: number; onCancel: () => void }) {
  const c = useColors();
  const t = useT();
  const [widened, setWidened] = useState(false);
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setWidened(false);
    if (!tags.length) return;
    const timer = setTimeout(() => setWidened(true), Math.max(0, since + RELAX_AFTER_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [since, tags.length]);

  // The faces bob gently while we look
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={[s.fill, s.center, { backgroundColor: c.bg }]}>
      <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }}>
        <FaceRow gap={0} faces={[
          { expression: 'Smile', color: '#5865F2', size: 52, tilt: -12 },
          { expression: 'Laugh', color: '#1A70D4', size: 68, overlap: -12, ring: c.bg },
          { expression: 'Em', color: '#EB459E', size: 52, tilt: 12, overlap: -12 },
        ]} />
      </Animated.View>
      <DisplayText style={[s.searchText, { color: c.text }]}>
        {tags.length ? t('match-searching-tags', { tags: tags.map(t.tag).join(' · ') }) : t('match-searching')}
      </DisplayText>
      {widened && <Text style={[s.heroSub, { color: c.textSub }]}>{t('match-widening')}</Text>}
      <Button label={t('match-cancel-search')} variant="quiet" onPress={onCancel} style={s.cancel} />
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
  const typingRow = typing ? <TypingRow /> : null;
  if (!bubbles.length) {
    return (
      <View style={[s.fill, s.center]}>
        <Text style={[s.empty, { color: c.textSub }]}>{t('match-empty')}</Text>
        {typingRow}
      </View>
    );
  }
  return (
    <FlatList
      data={[...bubbles].reverse()}
      inverted
      keyExtractor={(m) => String(m.id)}
      renderItem={({ item }) => <MessageBubble msg={item} />}
      ListHeaderComponent={typingRow}
      contentContainerStyle={s.list}
    />
  );
}

function TypingRow() {
  const c = useColors();
  const t = useT();
  return (
    <View style={s.typing}>
      <View style={[s.dots, { backgroundColor: c.surface }]}>
        {[0, 1, 2].map((i) => <View key={i} style={[s.dot, { backgroundColor: c.textMuted }]} />)}
      </View>
      <Text style={[s.typingText, { color: c.textSub }]}>{t('match-typing')}</Text>
    </View>
  );
}

function MatchComposer({ onSend, onTyping }: { onSend: (text: string) => void; onTyping: () => void }) {
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
    <View style={s.composerWrap}>
      <View style={[s.composer, { backgroundColor: c.surface, borderColor: c.border }]}>
        <TextInput
          style={[s.input, { color: c.text }]}
          placeholder={t('ph-message')} placeholderTextColor={c.textMuted} value={text} onChangeText={change}
          onSubmitEditing={send} returnKeyType="send" multiline numberOfLines={1}
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && isSendKey(e.nativeEvent)) {
              e.preventDefault?.();
              send();
            }
          }}
        />
        <TouchableOpacity style={[s.sendBtn, { backgroundColor: c.accent }, !text.trim() && { opacity: 0.45 }]} onPress={send}
          activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('send')}>
          <IconSend size={17} color={c.onAccent} />
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
  const live = status === 'connected';
  return (
    <View style={[s.card, { backgroundColor: bad ? c.dangerBg : c.surface }]}>
      <View style={[s.voiceDot, { backgroundColor: bad ? c.danger : live ? c.success : c.textMuted }]} />
      <Text style={[s.cardText, { color: bad ? c.danger : c.text }]}>{label}</Text>
      {live && (
        <TouchableOpacity style={[s.muteBtn, { backgroundColor: muted ? c.dangerBg : c.surface2 }]} onPress={onToggleMute}
          activeOpacity={0.7} accessibilityRole="button">
          {muted ? <IconMicOff size={16} color={c.danger} /> : <IconMic size={16} color={c.text} />}
          <Text style={[s.muteText, { color: muted ? c.danger : c.text }]}>{muted ? t('match-unmute') : t('match-mute')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: 14 },
  grow: { flexGrow: 1, flexBasis: 0 },
  heavy: { fontWeight: String(Fonts.heavy) as any },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  // start
  startScroll: { flexGrow: 1, alignItems: 'center', padding: Spacing.xl },
  startColumn: { width: '100%', maxWidth: 560, gap: 18 },
  hero: { alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 22, paddingHorizontal: Spacing.lg, borderRadius: 26 },
  heroTitle: { fontSize: 26, textAlign: 'center', marginTop: 4 },
  heroSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
  modes: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.lg, borderWidth: 2,
  },
  modeText: { fontSize: 15, fontWeight: String(Fonts.bold) as any },
  interests: { gap: 12 },
  interestsHead: { flexDirection: 'row', alignItems: 'baseline' },
  interestsTitle: { flex: 1, fontSize: 15, fontWeight: String(Fonts.heavy) as any },
  interestsCount: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  catTab: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: 14 },
  catText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  catBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginRight: -6 },
  catBadgeText: { fontSize: 11, fontWeight: String(Fonts.heavy) as any },
  tagPanel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14, borderRadius: Radius.xl },
  tag: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: 14 },
  tagText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingLeft: 12, paddingRight: 10, height: 28 },
  pickedText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },
  startActions: { gap: 10, marginTop: 4 },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  noteText: { fontSize: 13 },

  // searching
  searchText: { fontSize: 22, textAlign: 'center', maxWidth: 460, marginTop: 8 },
  cancel: { marginTop: 6, minWidth: 140 },

  // chat
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 18, paddingRight: 14,
    borderBottomWidth: 1, zIndex: 10,
  },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  headerName: { fontSize: 19 },
  sharedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sharedTag: { height: 22, paddingHorizontal: 9, borderRadius: Radius.full, justifyContent: 'center' },
  sharedTagText: { fontSize: 12, fontWeight: String(Fonts.heavy) as any },
  nextBtn: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: Radius.full },
  nextText: { fontSize: 14, fontWeight: String(Fonts.heavy) as any },
  menu: {
    position: 'absolute', top: '100%', right: 14, marginTop: 6, minWidth: 180, borderRadius: Radius.lg, borderWidth: 1, padding: 6,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, paddingHorizontal: 12, borderRadius: Radius.md },
  menuText: { fontSize: 14, fontWeight: String(Fonts.bold) as any },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, marginHorizontal: Spacing.lg,
    padding: 14, borderRadius: Radius.xl,
  },
  cardIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: String(Fonts.semibold) as any },
  cardBtn: { height: 38, paddingHorizontal: 14, borderRadius: Radius.md, justifyContent: 'center' },
  cardBtnText: { fontSize: 13, fontWeight: String(Fonts.heavy) as any },
  voiceDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 4 },
  muteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: Radius.full },
  muteText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },

  list: { paddingVertical: Spacing.sm, flexGrow: 1 },
  empty: { textAlign: 'center', fontSize: 14, fontWeight: String(Fonts.semibold) as any },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 6 },
  dots: { flexDirection: 'row', gap: 3, paddingVertical: 8, paddingHorizontal: 10, borderRadius: Radius.full },
  dot: { width: 6, height: 6, borderRadius: 3 },
  typingText: { fontSize: 13, fontWeight: String(Fonts.bold) as any },

  composerWrap: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 6, paddingRight: 6, paddingLeft: 16,
    borderRadius: Radius.xl, borderWidth: 1,
  },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingVertical: 11, fontSize: 16, outlineStyle: 'none' } as any,
  sendBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ended: { margin: 14, padding: Spacing.lg, gap: 12, borderRadius: Radius.xl, borderWidth: 1, alignItems: 'stretch' },
  endedText: { fontSize: 14, textAlign: 'center', fontWeight: String(Fonts.semibold) as any },
  endedActions: { flexDirection: 'row', gap: 10 },
});

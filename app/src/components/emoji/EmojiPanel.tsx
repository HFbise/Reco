import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { useT } from '../../hooks/useT';
import { useLangStore } from '../../store/langStore';
import type { I18nKey } from '../../lib/i18n';
import {
  IconBall, IconBulb, IconClock, IconClose, IconCoffee, IconFlag, IconHand, IconHeart, IconLeaf, IconPlane, IconSearch, IconSmile,
} from '../Icon';
import { GROUPS, cachedEmoji, loadEmoji, searchEmoji, type EmojiEntry, type Group } from './emojiData';
import { Fonts, Radius } from '../../theme';

const CELL = 44;
const HEADER = 34;
const RECENT = 'recent';
type Section = typeof RECENT | Group;

const ICONS: Record<Section, (color: string) => ReactNode> = {
  recent: (col) => <IconClock size={19} color={col} />,
  0: (col) => <IconSmile size={19} color={col} />,
  1: (col) => <IconHand size={19} color={col} />,
  3: (col) => <IconLeaf size={19} color={col} />,
  4: (col) => <IconCoffee size={19} color={col} />,
  5: (col) => <IconPlane size={19} color={col} />,
  6: (col) => <IconBall size={19} color={col} />,
  7: (col) => <IconBulb size={19} color={col} />,
  8: (col) => <IconHeart size={19} color={col} />,
  9: (col) => <IconFlag size={17} color={col} />,
};

type Row =
  | { kind: 'header'; key: string; section: Section; label: string }
  | { kind: 'emoji'; key: string; section: Section; items: { emoji: string; label: string }[] };

interface Props {
  onSelect: (emoji: string) => void;
  /** Most recent first; shown as the first section */
  recent: string[];
}

/**
 * Search, category tabs and one continuous, virtualized grid (1,800+ emoji stay smooth).
 * Tapping a tab jumps to its section; scrolling moves the highlighted tab along.
 */
export function EmojiPanel({ onSelect, recent }: Props) {
  const c = useColors();
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const [all, setAll] = useState<EmojiEntry[] | undefined>(() => cachedEmoji(lang));
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<Section>(recent.length ? RECENT : 0);
  const list = useRef<FlatList<Row>>(null);

  useEffect(() => {
    let alive = true;
    setAll(cachedEmoji(lang));
    loadEmoji(lang).then((data) => { if (alive) setAll(data); });
    return () => { alive = false; };
  }, [lang]);

  const cols = Math.max(6, Math.floor(width / CELL));
  // Share the leftover width out so rows run edge to edge
  const cellW = width ? width / cols : CELL;

  // Flatten sections into header rows and rows of `cols` emoji, with each row's offset for fast jumps
  const { rows, offsets, sectionIndex } = useMemo(() => {
    const out: Row[] = [];
    const index = new Map<Section, number>();
    const pushSection = (section: Section, label: string, items: { emoji: string; label: string }[]) => {
      if (!items.length) return;
      index.set(section, out.length);
      if (label) out.push({ kind: 'header', key: `h-${section}`, section, label });
      for (let i = 0; i < items.length; i += cols) {
        out.push({ kind: 'emoji', key: `${section}-${i}`, section, items: items.slice(i, i + cols) });
      }
    };
    const found = query.trim() && all ? searchEmoji(all, query) : null;
    if (found) {
      pushSection(0, '', found.map((e) => ({ emoji: e.emoji, label: e.annotation })));
    } else {
      const names = new Map((all ?? []).map((e) => [e.emoji, e.annotation]));
      pushSection(RECENT, t('emoji-recent'), recent.map((e) => ({ emoji: e, label: names.get(e) || e })));
      for (const g of GROUPS) {
        pushSection(g, t(`emoji-group-${g}` as I18nKey),
          (all ?? []).filter((e) => e.group === g).map((e) => ({ emoji: e.emoji, label: e.annotation })));
      }
    }
    const offs: number[] = [];
    let y = 0;
    for (const r of out) { offs.push(y); y += r.kind === 'header' ? HEADER : CELL; }
    return { rows: out, offsets: offs, sectionIndex: index };
  }, [all, query, recent, cols, t]);

  const tabs: Section[] = [...(recent.length ? [RECENT as Section] : []), ...GROUPS];
  const searching = !!query.trim();

  function jump(section: Section) {
    const i = sectionIndex.get(section);
    if (i == null) return;
    setActive(section);
    list.current?.scrollToOffset({ offset: offsets[i], animated: false });
  }

  const viewable = useRef(({ viewableItems }: { viewableItems: { item: Row }[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setActive(first.section);
  }).current;

  return (
    <View style={s.root}>
      <View style={[s.search, { backgroundColor: c.surface2 }]}>
        <IconSearch size={16} color={c.textMuted} />
        <TextInput
          style={[s.searchInput, { color: c.text }]}
          placeholder={t('emoji-search')}
          placeholderTextColor={c.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          accessibilityLabel={t('emoji-search')}
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('cancel')}>
            <IconClose size={12} color={c.textSub} />
          </TouchableOpacity>
        )}
      </View>

      {!searching && (
        <View style={[s.tabs, { borderBottomColor: c.border }]} accessibilityRole="tablist">
          {tabs.map((sec) => {
            const on = active === sec;
            return (
              <TouchableOpacity key={String(sec)} onPress={() => jump(sec)} activeOpacity={0.7}
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                accessibilityLabel={sec === RECENT ? t('emoji-recent') : t(`emoji-group-${sec}` as I18nKey)}
                style={[s.tab, on && { backgroundColor: c.accentBg }]}>
                {ICONS[sec](on ? c.accent : c.textMuted)}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={s.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 12)}>
        {width > 0 && (
          <FlatList
            ref={list}
            data={rows}
            keyExtractor={(r) => r.key}
            getItemLayout={(_d, i) => ({
              length: rows[i]?.kind === 'header' ? HEADER : CELL, offset: offsets[i] ?? 0, index: i,
            })}
            onViewableItemsChanged={viewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            initialNumToRender={14}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.gridContent}
            ListEmptyComponent={
              !all ? <ActivityIndicator color={c.accent} style={s.empty} />
                : <Text style={[s.emptyText, { color: c.textSub }]}>{t('emoji-no-result')}</Text>
            }
            renderItem={({ item }) => item.kind === 'header' ? (
              <Text style={[s.header, { color: c.textSub }]} numberOfLines={1}>{item.label.toUpperCase()}</Text>
            ) : (
              <View style={s.row}>
                {item.items.map((e) => (
                  <EmojiCell key={e.emoji} emoji={e.emoji} label={e.label} width={cellW} hover={c.surface2}
                    onPress={() => onSelect(e.emoji)} />
                ))}
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

function EmojiCell({ emoji, label, width, hover, onPress }: {
  emoji: string; label: string; width: number; hover: string; onPress: () => void;
}) {
  const [on, setOn] = useState(false);
  const web = Platform.OS === 'web' ? { onMouseEnter: () => setOn(true), onMouseLeave: () => setOn(false) } : {};
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={label}
      style={[s.cell, { width }, on && { backgroundColor: hover }]} {...(web as any)}>
      <Text style={s.emoji}>{emoji}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: Radius.full,
    paddingHorizontal: 14, marginHorizontal: 12, marginTop: 12, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, outlineStyle: 'none' } as any,
  tabs: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 6, borderBottomWidth: 1 },
  tab: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  grid: { flex: 1, paddingHorizontal: 6 },
  gridContent: { paddingBottom: 12 },
  header: {
    height: HEADER, paddingTop: 12, paddingHorizontal: 6,
    fontSize: 11, fontWeight: String(Fonts.heavy) as any, letterSpacing: 0.7,
  },
  row: { flexDirection: 'row', height: CELL },
  cell: { width: CELL, height: CELL, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28, lineHeight: 34 },
  empty: { marginTop: 40 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: String(Fonts.semibold) as any },
});

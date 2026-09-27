import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useColors } from '../hooks/useColors';
import { useT } from '../hooks/useT';
import { useLangStore } from '../store/langStore';
import { EMOJI_CDN, type Lang } from '../lib/i18n';
import { Radius, Spacing } from '../theme';

interface EmojiEntry { emoji: string; annotation: string; group: number; tags?: string[]; }

const FALLBACK: EmojiEntry[] = [
  '😀','😂','🥰','😍','🤩','😎','🥳','😭','😤','🤔',
  '👍','👎','👌','✌️','💪','🙏','👏','🤝','❤️','🔥',
  '🎉','✨','💯','🚀','⭐','🌈','🎁','🍕','🎮','💻',
].map(e => ({ emoji: e, annotation: e, group: 0 }));

const _cache: Partial<Record<Lang, EmojiEntry[]>> = {};
const _promises: Partial<Record<Lang, Promise<EmojiEntry[]>>> = {};

async function loadEmojiData(lang: Lang): Promise<EmojiEntry[]> {
  if (_cache[lang]) return _cache[lang]!;
  if (_promises[lang]) return _promises[lang]!;
  _promises[lang] = fetch(EMOJI_CDN[lang])
    .then(r => r.json())
    .then((raw: any) => {
      const arr: any[] = Array.isArray(raw) ? raw : (raw.emoji || []);
      _cache[lang] = arr.map((item: any) => ({
        emoji: item.emoji,
        annotation: item.annotation || '',
        group: item.group ?? 0,
        tags: item.tags,
      }));
      return _cache[lang]!;
    })
    .catch(() => {
      _cache[lang] = FALLBACK;
      return FALLBACK;
    });
  return _promises[lang]!;
}

interface Props {
  onSelect: (emoji: string) => void;
  style?: any;
}

export function EmojiPicker({ onSelect, style }: Props) {
  const c = useColors();
  const t = useT();
  const lang = useLangStore(s => s.lang);
  const [search, setSearch] = useState('');
  const [catIdx, setCatIdx] = useState(0);
  const [allEmojis, setAllEmojis] = useState<EmojiEntry[]>(_cache[lang] ?? []);
  const [loading, setLoading] = useState(!_cache[lang]);

  useEffect(() => {
    if (_cache[lang]) {
      setAllEmojis(_cache[lang]!);
      setLoading(false);
      return;
    }
    setLoading(true);
    setAllEmojis([]);
    loadEmojiData(lang).then(data => {
      setAllEmojis(data);
      setLoading(false);
    });
  }, [lang]);

  // Reset to first category when language or data changes
  useEffect(() => { setCatIdx(0); }, [lang]);

  const categories = useMemo(() => {
    const groups = new Map<number, EmojiEntry[]>();
    for (const e of allEmojis) {
      if (!groups.has(e.group)) groups.set(e.group, []);
      groups.get(e.group)!.push(e);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([g, emojis]) => ({
        group: g,
        label: t(`emoji-group-${g}` as any) ?? `Group ${g}`,
        emojis,
      }));
  }, [allEmojis, t]);

  const displayEmojis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories[catIdx]?.emojis ?? [];
    return allEmojis.filter(e =>
      e.annotation.toLowerCase().includes(q) ||
      e.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }, [search, catIdx, allEmojis, categories]);

  return (
    <View style={[s.box, { backgroundColor: c.surface }, style]}>
      <View style={[s.searchRow, { borderBottomColor: c.border }]}>
        <TextInput
          style={[s.searchInput, { color: c.text, backgroundColor: c.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}
          placeholder={t('emoji-search')}
          placeholderTextColor={c.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {!search.trim() && (
        <View style={[s.catBar, { borderBottomColor: c.border }]}>
          {categories.map((cat, i) => (
            <TouchableOpacity
              key={cat.group}
              style={[s.catTab, i === catIdx && { backgroundColor: c.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
              onPress={() => setCatIdx(i)}
              activeOpacity={0.7}
            >
              <Text style={s.catTabText}>{cat.label.split(' ')[0]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView style={s.grid} contentContainerStyle={s.gridContent} showsVerticalScrollIndicator={false}>
          <View style={s.emojiWrap}>
            {displayEmojis.map((item, i) => (
              <TouchableOpacity key={i} style={s.emojiBtn} onPress={() => onSelect(item.emoji)} activeOpacity={0.7}>
                <Text style={s.emojiText}>{item.emoji}</Text>
              </TouchableOpacity>
            ))}
            {displayEmojis.length === 0 && (
              <Text style={[s.emptyText, { color: c.textMuted }]}>{t('emoji-no-result')}</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    width: 344, maxHeight: 440,
    borderRadius: Radius.lg, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 16, elevation: 12,
  },
  searchRow: { paddingHorizontal: Spacing.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { height: 34, borderRadius: 8, paddingHorizontal: 12, fontSize: 14 },
  catBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4, paddingVertical: 3 },
  catTab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRadius: 6 },
  catTabText: { fontSize: 18 },
  grid: { flex: 1 },
  gridContent: { paddingBottom: 8 },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  emojiBtn: { width: '12.5%' as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  emojiText: { fontSize: 22 },
  emptyText: { padding: Spacing.md, fontSize: 13 },
  loadingBox: { height: 120, alignItems: 'center', justifyContent: 'center' },
});

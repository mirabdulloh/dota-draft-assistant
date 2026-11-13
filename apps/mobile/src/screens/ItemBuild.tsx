import { useMemo } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ScrollView } from 'react-native';
import { itemBuild, type Recommendation } from '@dota/engine';
import { C, S, portraitUrl } from '../theme';
import { useDraft } from '../store';
import { heroById, heroName, itemData, itemIconUrl } from '../snapshot';

const TAG_LABEL: Record<string, string> = {
  magic_burst: 'magic burst',
  physical_carry: 'physical damage',
  single_target_disable: 'single-target lockdown',
  heavy_healing: 'healing',
  evasion: 'evasion',
  strong_passive: 'strong passives',
  invisibility: 'invisibility',
  illusions_summons: 'illusions and summons',
  blink_initiator: 'blink initiation',
  buff_dependent: 'buffs and dispels',
  physical_immunity: 'physical immunity',
  silence: 'silences',
};

function ItemRow({ item, tone }: { item: Recommendation; tone: 'because' | 'skip' }) {
  return (
    <View style={[st.row, tone === 'skip' && st.rowSkip]}>
      <Image source={{ uri: itemIconUrl(item.key) }} style={st.icon} />
      <View style={st.rowBody}>
        <Text style={[st.itemName, tone === 'skip' && st.itemNameSkip]}>{item.name}</Text>
        {/* The reason is the product — the icon alone teaches nothing. */}
        <Text style={st.reason}>{item.reason}</Text>
      </View>
    </View>
  );
}

export function ItemBuildScreen() {
  const { myHero, enemies, setShowItems, openPicker } = useDraft();
  const enemyIds = enemies.filter((x): x is number => x != null);

  const build = useMemo(
    () => (myHero == null ? null : itemBuild(itemData, myHero, enemyIds, heroName)),
    [myHero, enemyIds.join(',')],
  );

  const meta = myHero != null ? heroById.get(myHero) : undefined;

  return (
    <View style={st.root}>
      <View style={st.header}>
        <Pressable onPress={() => setShowItems(false)} hitSlop={12} style={st.back}>
          <Text style={st.backText}>‹ Draft</Text>
        </Pressable>
        <Text style={st.title}>Item build</Text>
      </View>

      <Pressable onPress={() => openPicker({ team: 'me', index: 0 })} style={st.hero}>
        {meta ? (
          <>
            <Image source={{ uri: portraitUrl(meta.slug) }} style={st.heroImg} />
            <Text style={st.heroName}>{meta.name}</Text>
            <Text style={st.heroSwap}>change</Text>
          </>
        ) : (
          <Text style={st.heroPick}>Tap to choose the hero you picked</Text>
        )}
      </Pressable>

      {build && (
        <ScrollView style={st.list} contentContainerStyle={{ paddingBottom: 30 }}>
          {build.threats.length > 0 && (
            <Text style={st.threats}>
              They threaten {build.threats.slice(0, 4).map((t) => TAG_LABEL[t.tag] ?? t.tag).join(', ')}
            </Text>
          )}

          <Text style={st.section}>CORE</Text>
          <Text style={st.sectionHint}>what wins on this hero regardless</Text>
          {build.core.length === 0 ? (
            <Text style={st.empty}>No core build data for this hero yet.</Text>
          ) : (
            <View style={st.coreWrap}>
              {build.core.map((c) => (
                <View key={c.key} style={st.coreChip}>
                  <Image source={{ uri: itemIconUrl(c.key) }} style={st.coreIcon} />
                  <Text style={st.coreName} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={st.section}>BECAUSE OF THEM</Text>
          <Text style={st.sectionHint}>situational, caused by this exact lineup</Text>
          {build.because.length === 0 ? (
            <Text style={st.empty}>Add enemy heroes to see what to build against them.</Text>
          ) : (
            build.because.map((r) => <ItemRow key={r.key} item={r} tone="because" />)
          )}

          {build.skip.length > 0 && (
            <>
              <Text style={st.section}>SKIP THIS GAME</Text>
              <Text style={st.sectionHint}>normally good on this hero, bad into this lineup</Text>
              {build.skip.map((r) => (
                <ItemRow key={r.key} item={r} tone="skip" />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.pad },
  back: { minHeight: 40, justifyContent: 'center' },
  backText: { color: C.accent, fontSize: 16, fontWeight: '600' },
  title: { color: C.text, fontSize: 20, fontWeight: '700' },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    margin: S.pad,
    padding: 8,
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: S.tap,
  },
  heroImg: { width: 62, height: 35, borderRadius: 5, backgroundColor: C.surfaceAlt },
  heroName: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },
  heroSwap: { color: C.faint, fontSize: 12 },
  heroPick: { color: C.accent, fontSize: 15, fontWeight: '600' },
  list: { flex: 1, paddingHorizontal: S.pad },
  threats: { color: C.warn, fontSize: 13, marginBottom: 12 },
  section: { color: C.text, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginTop: 14 },
  sectionHint: { color: C.faint, fontSize: 11, marginBottom: 8 },
  empty: { color: C.faint, fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  coreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  coreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.border,
    paddingRight: 10,
  },
  coreIcon: { width: 36, height: 27, borderRadius: 4, backgroundColor: C.surfaceAlt },
  coreName: { color: C.dim, fontSize: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
    marginBottom: 6,
  },
  rowSkip: { backgroundColor: 'rgba(224,90,90,0.08)', borderColor: 'rgba(224,90,90,0.3)' },
  icon: { width: 44, height: 33, borderRadius: 4, backgroundColor: C.surfaceAlt },
  rowBody: { flex: 1 },
  itemName: { color: C.text, fontSize: 15, fontWeight: '700' },
  itemNameSkip: { color: C.dire },
  reason: { color: C.dim, fontSize: 12, marginTop: 2 },
});

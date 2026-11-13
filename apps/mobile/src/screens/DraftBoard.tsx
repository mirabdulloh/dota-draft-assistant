import { useMemo } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ScrollView } from 'react-native';
import { C, S, portraitUrl } from '../theme';
import { useDraft } from '../store';
import { engine, heroById, heroName } from '../snapshot';

function Slot({
  heroId,
  team,
  index,
}: {
  heroId: number | null;
  team: 'enemy' | 'ally';
  index: number;
}) {
  const openPicker = useDraft((s) => s.openPicker);
  const clearSlot = useDraft((s) => s.clearSlot);
  const meta = heroId != null ? heroById.get(heroId) : undefined;
  const tint = team === 'enemy' ? C.dire : C.radiant;

  return (
    <Pressable
      onPress={() => (heroId == null ? openPicker({ team, index }) : clearSlot(team, index))}
      style={[st.slot, { borderColor: heroId ? tint : C.border }]}
    >
      {meta ? (
        <Image source={{ uri: portraitUrl(meta.slug) }} style={st.slotImg} />
      ) : (
        <Text style={st.slotPlus}>+</Text>
      )}
    </Pressable>
  );
}

function Confidence({ value }: { value: number }) {
  const filled = Math.max(1, Math.round(value * 5));
  return (
    <View style={st.dots}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[st.dot, i < filled ? st.dotOn : st.dotOff]} />
      ))}
    </View>
  );
}

export function DraftBoard() {
  const clearMine = () => useDraft.getState().clearSlot('me', 0);
  const { position, pickOrder, enemies, allies, reset, openPicker, myHero, setShowItems } = useDraft();
  const myMeta = myHero != null ? heroById.get(myHero) : undefined;

  const result = useMemo(() => {
    const t0 = Date.now();
    const r = engine.suggest(
      {
        myPosition: position,
        pickOrder,
        enemies: enemies.filter((x): x is number => x != null),
        allies: allies.filter((x): x is number => x != null),
        banned: [],
      },
      5,
    );
    return { ...r, ms: Date.now() - t0 };
  }, [position, pickOrder, enemies, allies]);

  const avoid = result.avoid[0];

  return (
    <View style={st.root}>
      <View style={st.top}>
        <View style={st.rowHead}>
          <Text numberOfLines={1} style={[st.rowTag, { color: C.dire }]}>ENEMY</Text>
          <View style={st.slots}>
            {enemies.map((h, i) => (
              <Slot key={i} heroId={h} team="enemy" index={i} />
            ))}
          </View>
        </View>

        <View style={st.rowHead}>
          <Text numberOfLines={1} style={[st.rowTag, { color: C.radiant }]}>ALLY</Text>
          <View style={st.slots}>
            {allies.map((h, i) => (
              <Slot key={i} heroId={h} team="ally" index={i} />
            ))}
            <Pressable
              onPress={() =>
                myHero == null ? openPicker({ team: 'me', index: 0 }) : clearMine()
              }
              style={[st.slot, st.youSlot]}
            >
              {myMeta ? (
                <Image source={{ uri: portraitUrl(myMeta.slug) }} style={st.slotImg} />
              ) : (
                <>
                  <Text style={st.youText}>YOU</Text>
                  <Text style={st.youPos}>pos {position}</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <View style={st.bar}>
        <Text style={st.barTitle}>PICK NOW</Text>
        <Text style={st.barMode}>{result.mode.replace('_', ' ')}</Text>
      </View>

      <ScrollView style={st.list} contentContainerStyle={{ paddingBottom: 16 }}>
        {result.picks.map((p, i) => {
          const meta = heroById.get(p.heroId);
          return (
            <View key={p.heroId} style={st.pick}>
              <Text style={st.rank}>{i + 1}</Text>
              {meta && <Image source={{ uri: portraitUrl(meta.slug) }} style={st.pickImg} />}
              <View style={st.pickBody}>
                <View style={st.pickTop}>
                  <Text style={st.pickName} numberOfLines={1}>
                    {heroName(p.heroId)}
                  </Text>
                  <Text style={st.pickScore}>
                    {p.score >= 0 ? '+' : ''}
                    {(p.score * 100).toFixed(1)}
                  </Text>
                  <Confidence value={p.confidence} />
                </View>
                {/* The reason line is mandatory: a bare number teaches nothing. */}
                <Text style={st.pickReason} numberOfLines={1}>
                  {p.reason}
                </Text>
              </View>
            </View>
          );
        })}

        {avoid && (
          <View style={st.avoid}>
            <Text style={st.avoidText} numberOfLines={1}>
              Avoid {heroName(avoid.heroId)} — {avoid.reason}
            </Text>
          </View>
        )}

        {result.missing.length > 0 && (
          <Text style={st.missing}>Not using: {result.missing.join(', ')}</Text>
        )}
      </ScrollView>

      <View style={st.footer}>
        <Pressable onPress={reset} style={[st.fBtn, st.fGhost]}>
          <Text style={st.fGhostText}>Reset</Text>
        </Pressable>
        {myHero == null ? (
          <Pressable
            onPress={() => openPicker({ team: 'enemy', index: enemies.findIndex((e) => e == null) })}
            style={[st.fBtn, st.fPrimary]}
            disabled={!enemies.includes(null)}
          >
            <Text style={st.fPrimaryText}>Add enemy pick</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setShowItems(true)} style={[st.fBtn, st.fPrimary]}>
            <Text style={st.fPrimaryText}>Draft done → items</Text>
          </Pressable>
        )}
      </View>

      <Text style={st.perf}>scored locally in {result.ms}ms · offline</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 48 },
  top: { paddingHorizontal: S.pad, gap: S.gap },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, width: 46 },
  slots: { flexDirection: 'row', gap: 6, flex: 1 },
  slot: {
    flex: 1,
    aspectRatio: 1.25,
    // Capped so the hero rows cannot grow and push the top five off screen,
    // which is a hard requirement: five suggestions visible with no scroll.
    maxHeight: 58,
    borderRadius: 7,
    borderWidth: 1.5,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  slotImg: { width: '100%', height: '100%' },
  slotPlus: { color: C.faint, fontSize: 20, fontWeight: '300' },
  youSlot: { borderColor: C.accent, borderStyle: 'dashed' },
  youText: { color: C.accent, fontSize: 10, fontWeight: '800' },
  youPos: { color: C.faint, fontSize: 9 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.pad,
    paddingTop: 16,
    paddingBottom: 8,
  },
  barTitle: { color: C.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  barMode: { color: C.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  list: { flex: 1, paddingHorizontal: S.pad },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
    marginBottom: 6,
    minHeight: 62,
  },
  rank: { color: C.faint, fontSize: 13, fontWeight: '700', width: 14 },
  pickImg: { width: 62, height: 35, borderRadius: 5, backgroundColor: C.surfaceAlt },
  pickBody: { flex: 1 },
  pickTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickName: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },
  pickScore: { color: C.radiant, fontSize: 14, fontWeight: '700' },
  pickReason: { color: C.dim, fontSize: 12, marginTop: 2 },
  dots: { flexDirection: 'row', gap: 2.5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotOn: { backgroundColor: C.accent },
  dotOff: { backgroundColor: C.border },
  avoid: {
    backgroundColor: 'rgba(224,90,90,0.10)',
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: 'rgba(224,90,90,0.35)',
    padding: 10,
    marginTop: 2,
  },
  avoidText: { color: C.dire, fontSize: 13, fontWeight: '600' },
  missing: { color: C.faint, fontSize: 11, marginTop: 10, fontStyle: 'italic' },
  footer: { flexDirection: 'row', gap: S.gap, paddingHorizontal: S.pad, paddingTop: 6 },
  fBtn: { minHeight: S.tap, borderRadius: S.radius, alignItems: 'center', justifyContent: 'center' },
  fGhost: { flex: 1, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  fGhostText: { color: C.dim, fontSize: 15, fontWeight: '600' },
  fPrimary: { flex: 2, backgroundColor: C.accent },
  fPrimaryText: { color: '#06101C', fontSize: 15, fontWeight: '800' },
  perf: { color: C.faint, fontSize: 10, textAlign: 'center', paddingVertical: 8 },
});

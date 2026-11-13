import { useMemo } from 'react';
import { Modal, View, Text, Pressable, Image, StyleSheet, ScrollView } from 'react-native';
import { C, S, portraitUrl } from '../theme';
import { useDraft } from '../store';
import { engineFor, heroById, heroName } from '../snapshot';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}%`;

function Bar({ value, max }: { value: number; max: number }) {
  const width = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <View style={st.barTrack}>
      <View
        style={[
          st.barFill,
          { width: `${width}%`, backgroundColor: value >= 0 ? C.radiant : C.dire },
        ]}
      />
    </View>
  );
}

/**
 * Why a hero is being suggested, matchup by matchup, with the real sample size
 * behind each number. Surfacing "strong counter, low data" is more useful than
 * a confident-looking score with nothing behind it.
 */
export function SuggestionDetail() {
  const { detailHero, setDetailHero, bracket, position, pickOrder, enemies, allies, banned } = useDraft();

  const data = useMemo(() => {
    if (detailHero == null) return null;
    return engineFor(bracket).explain(detailHero, {
      myPosition: position,
      pickOrder,
      enemies: enemies.filter((x): x is number => x != null),
      allies: allies.filter((x): x is number => x != null),
      banned,
    });
  }, [detailHero, bracket, position, pickOrder, enemies, allies, banned]);

  const meta = detailHero != null ? heroById.get(detailHero) : undefined;
  const maxAdv = useMemo(
    () => Math.max(0.02, ...(data?.vs.map((v) => Math.abs(v.advantage)) ?? [0])),
    [data],
  );

  return (
    <Modal visible={detailHero != null} animationType="slide" onRequestClose={() => setDetailHero(null)}>
      <View style={st.root}>
        <View style={st.header}>
          <Pressable onPress={() => setDetailHero(null)} hitSlop={12} style={st.back}>
            <Text style={st.backText}>Close</Text>
          </Pressable>
        </View>

        {meta && data && (
          <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={st.hero}>
              <Image source={{ uri: portraitUrl(meta.slug) }} style={st.heroImg} />
              <View style={{ flex: 1 }}>
                <Text style={st.heroName}>{meta.name}</Text>
                <Text style={st.heroSub}>
                  {(data.baseline * 100).toFixed(1)}% base win rate ·{' '}
                  {(data.pickRate * 100).toFixed(1)}% pick rate
                </Text>
              </View>
            </View>

            <Text style={st.section}>AGAINST EACH ENEMY</Text>
            {data.vs.length === 0 ? (
              <Text style={st.empty}>No enemy heroes entered yet.</Text>
            ) : (
              data.vs.map((v) => (
                <View key={v.heroId} style={st.row}>
                  <View style={st.rowTop}>
                    <Text style={st.rowName}>{heroName(v.heroId)}</Text>
                    <Text style={[st.rowVal, { color: v.advantage >= 0 ? C.radiant : C.dire }]}>
                      {pct(v.advantage)}
                    </Text>
                  </View>
                  <Bar value={v.advantage} max={maxAdv} />
                  <Text style={st.rowMeta}>
                    {v.games.toLocaleString()} games · confidence {(v.confidence * 100).toFixed(0)}%
                    {v.confidence < 0.4 ? ' · low data' : ''}
                  </Text>
                  {/* Asymmetric: them beating you is a different number. */}
                  {v.risk > 0.01 && (
                    <Text style={st.risk}>
                      ⚠ they also gain {pct(v.risk)} against you
                    </Text>
                  )}
                </View>
              ))
            )}

            {data.withAllies.length > 0 && (
              <>
                <Text style={st.section}>WITH YOUR TEAM</Text>
                {data.withAllies.map((a) => (
                  <View key={a.heroId} style={st.row}>
                    <View style={st.rowTop}>
                      <Text style={st.rowName}>{heroName(a.heroId)}</Text>
                      <Text style={[st.rowVal, { color: a.synergy >= 0 ? C.radiant : C.dire }]}>
                        {pct(a.synergy)}
                      </Text>
                    </View>
                    <Text style={st.rowMeta}>
                      {a.games.toLocaleString()} games · confidence {(a.confidence * 100).toFixed(0)}%
                    </Text>
                  </View>
                ))}
              </>
            )}

            <Text style={st.note}>
              Advantage is this hero's win rate against that enemy minus its own baseline,
              shrunk toward the baseline by sample size. A big number on few games is
              deliberately pulled toward zero.
            </Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: S.pad },
  back: { minHeight: 40, justifyContent: 'center' },
  backText: { color: C.accent, fontSize: 16, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: S.pad },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  heroImg: { width: 80, height: 45, borderRadius: 6, backgroundColor: C.surfaceAlt },
  heroName: { color: C.text, fontSize: 22, fontWeight: '700' },
  heroSub: { color: C.faint, fontSize: 12, marginTop: 2 },
  section: { color: C.dim, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginTop: 20, marginBottom: 8 },
  empty: { color: C.faint, fontSize: 13, fontStyle: 'italic' },
  row: {
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    marginBottom: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowVal: { fontSize: 15, fontWeight: '700' },
  barTrack: { height: 4, backgroundColor: C.surfaceAlt, borderRadius: 2, marginTop: 7, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  rowMeta: { color: C.faint, fontSize: 11, marginTop: 6 },
  risk: { color: C.warn, fontSize: 11, marginTop: 4 },
  note: { color: C.faint, fontSize: 11, lineHeight: 16, marginTop: 18, fontStyle: 'italic' },
});

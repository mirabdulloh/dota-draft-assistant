import { Text, View, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { PickOrder, Position } from '@dota/engine';
import { modeFor } from '@dota/engine';
import { C, S } from '../theme';
import { useDraft } from '../store';
import { snapshotInfoFor, BRACKET_NAME, BRACKETS, type Bracket } from '../snapshot';

const POSITIONS: { value: Position; label: string }[] = [
  { value: 1, label: 'Safe carry' },
  { value: 2, label: 'Mid' },
  { value: 3, label: 'Offlane' },
  { value: 4, label: 'Soft support' },
  { value: 5, label: 'Hard support' },
];

const ORDERS: { value: PickOrder; label: string; hint: string }[] = [
  { value: 'first', label: '1st', hint: 'nothing on the board yet' },
  { value: 'second', label: '2nd', hint: 'one or two enemies known' },
  { value: 'third', label: '3rd', hint: 'one or two enemies known' },
  { value: 'fourth', label: '4th', hint: 'three enemies known' },
  { value: 'last', label: 'Last', hint: 'you have the information advantage' },
];

const MODE_BLURB: Record<string, string> = {
  SAFE: 'Ranks heroes that are hard to punish. No counter weight — there is nothing to counter yet.',
  MIXED: 'Balanced. Leans toward counters as more of their draft appears.',
  COUNTER: 'Counters what is visible, with little weight on your own risk.',
  HARD_COUNTER: 'Maximum counter weight. You pick last, so punish what they committed to.',
};

export function DraftSetup() {
  const { bracket, position, pickOrder, setBracket, setPosition, setPickOrder, start } = useDraft();
  const mode = modeFor(pickOrder);
  const info = snapshotInfoFor(bracket);

  return (
    <ScrollView style={st.root} contentContainerStyle={st.content}>
      <Text style={st.h1}>New draft</Text>
      <Text style={st.sub}>
        patch {info.patch} · {info.matches.toLocaleString()} matches in this bracket
      </Text>

      <Text style={st.label}>Your bracket</Text>
      <View style={st.brackets}>
        {BRACKETS.map((b) => {
          const on = b === bracket;
          return (
            <Pressable
              key={b}
              onPress={() => setBracket(b as Bracket)}
              style={[st.bracket, on && st.bracketOn]}
            >
              <Text style={[st.bracketText, on && st.bracketTextOn]} numberOfLines={1}>
                {BRACKET_NAME[b]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={st.label}>Your position</Text>
      <View style={st.col}>
        {POSITIONS.map((p) => {
          const on = p.value === position;
          return (
            <Pressable
              key={p.value}
              onPress={() => setPosition(p.value)}
              style={[st.row, on && st.rowOn]}
            >
              <Text style={[st.rowNum, on && st.rowNumOn]}>{p.value}</Text>
              <Text style={[st.rowLabel, on && st.rowLabelOn]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={st.label}>Your pick slot</Text>
      <View style={st.chips}>
        {ORDERS.map((o) => {
          const on = o.value === pickOrder;
          return (
            <Pressable
              key={o.value}
              onPress={() => setPickOrder(o.value)}
              style={[st.chip, on && st.chipOn]}
            >
              <Text style={[st.chipText, on && st.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={st.modeBox}>
        <Text style={st.modeName}>{mode.replace('_', ' ')}</Text>
        <Text style={st.modeBlurb}>{MODE_BLURB[mode]}</Text>
      </View>

      <Pressable onPress={start} style={st.cta}>
        <Text style={st.ctaText}>Start draft</Text>
      </Pressable>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: S.pad, paddingBottom: 40 },
  h1: { color: C.text, fontSize: 26, fontWeight: '700' },
  sub: { color: C.faint, fontSize: 12, marginTop: 4, marginBottom: 20 },
  label: { color: C.dim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  col: { gap: S.gap, marginBottom: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: S.tap,
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.pad,
    gap: 14,
  },
  rowOn: { borderColor: C.accent, backgroundColor: C.surfaceAlt },
  rowNum: { color: C.faint, fontSize: 18, fontWeight: '700', width: 20 },
  rowNumOn: { color: C.accent },
  rowLabel: { color: C.dim, fontSize: 16 },
  rowLabelOn: { color: C.text, fontWeight: '600' },
  brackets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 22 },
  bracket: {
    paddingHorizontal: 12,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
  },
  bracketOn: { borderColor: C.accent, backgroundColor: C.surfaceAlt },
  bracketText: { color: C.dim, fontSize: 13, fontWeight: '600' },
  bracketTextOn: { color: C.accent },
  chips: { flexDirection: 'row', gap: S.gap, marginBottom: 22 },
  chip: {
    flex: 1,
    minHeight: S.tap,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipOn: { borderColor: C.accent, backgroundColor: C.surfaceAlt },
  chipText: { color: C.dim, fontSize: 15, fontWeight: '600' },
  chipTextOn: { color: C.accent },
  modeBox: {
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.pad,
    marginBottom: 24,
  },
  modeName: { color: C.accent, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  modeBlurb: { color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 6 },
  cta: {
    minHeight: 58,
    borderRadius: S.radius,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#06101C', fontSize: 17, fontWeight: '800' },
});

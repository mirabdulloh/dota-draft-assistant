import { heroes } from 'dotaconstants';
import { createEngine } from '@dota/engine';
import type { Db } from './db.ts';
import { Aggregator } from './aggregate.ts';
import { buildSnapshot } from './snapshot.ts';
import type { PublicMatch } from './opendota.ts';

const NAME = new Map<number, string>(
  Object.values(heroes as Record<string, { id: number; localized_name: string }>).map((h) => [
    h.id,
    h.localized_name,
  ]),
);

const TEST_EVERY = 5;
const BRACKET = 5;

function arr(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string') return v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  return [];
}

function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const order = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], pos) => {
      r[i] = pos;
    });
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const mean = (n - 1) / 2;
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < n; i++) {
    const x = ra[i] - mean;
    const y = rb[i] - mean;
    num += x * y;
    da += x * x;
    dbb += y * y;
  }
  return num / Math.sqrt(da * dbb);
}

/** Spearman of a vs b with c's influence removed. */
function partial(a: number[], b: number[], c: number[]): number {
  const ab = spearman(a, b);
  const ac = spearman(a, c);
  const bc = spearman(b, c);
  return (ab - ac * bc) / Math.sqrt((1 - ac * ac) * (1 - bc * bc));
}

const quantile = (sorted: Float64Array, q: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];

export async function validateSafeMode(
  db: Db,
  opts: { k: number; patch: string; maxLineups: number },
): Promise<void> {
  const train = new Aggregator();
  const test = new Aggregator();
  const lineups: number[][] = [];

  let cursor = 0;
  for (;;) {
    const rows = await db.query<{
      match_id: string | number;
      avg_rank_tier: number | null;
      radiant_win: boolean;
      radiant_team: unknown;
      dire_team: unknown;
    }>(
      `SELECT match_id, avg_rank_tier, radiant_win, radiant_team, dire_team
       FROM matches WHERE match_id > $1 ORDER BY match_id LIMIT 20000`,
      [cursor],
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      const matchId = Number(r.match_id);
      const radiant = arr(r.radiant_team);
      const dire = arr(r.dire_team);
      if (radiant.length !== 5 || dire.length !== 5 || r.avg_rank_tier == null) continue;
      const m = {
        match_id: matchId,
        start_time: 0,
        avg_rank_tier: r.avg_rank_tier,
        radiant_win: r.radiant_win,
        radiant_team: radiant,
        dire_team: dire,
      } as PublicMatch;

      if (matchId % TEST_EVERY === 0) {
        test.add(m);
        // Enemy lineups a blind first pick could end up facing, at the target bracket.
        if (
          Math.floor(r.avg_rank_tier / 10) === BRACKET &&
          lineups.length < opts.maxLineups
        ) {
          lineups.push(dire);
        }
      } else {
        train.add(m);
      }
    }
    cursor = Number(rows[rows.length - 1].match_id);
    if (rows.length < 20000) break;
  }

  // Two independent tables: strategies see only `train`, outcomes are scored
  // only with `test`, so nothing a strategy used can score itself.
  const trainSnap = buildSnapshot(train, { bracket: BRACKET, k: opts.k, patch: opts.patch });
  const testSnap = buildSnapshot(test, { bracket: BRACKET, k: opts.k, patch: opts.patch });
  const engine = createEngine(trainSnap);

  const ids = trainSnap.heroIds;
  const n = ids.length;
  const posOf = new Map<number, number>(ids.map((id, i) => [id, i]));

  console.log(`train ${train.matchCount.toLocaleString()} / test ${test.matchCount.toLocaleString()} matches`);
  console.log(`evaluating against ${lineups.length.toLocaleString()} held-out enemy lineups\n`);

  // Only heroes with enough train and test signal to be worth ranking.
  const candidates = ids
    .map((id, i) => ({ id, i }))
    .filter(({ i }) => trainSnap.pickRate[i] > 0.005 && testSnap.pickRate[i] > 0.005);

  const lineupIdx = lineups.map((L) => L.map((h) => posOf.get(h) ?? -1).filter((x) => x >= 0));

  type Row = { id: number; exposure: number; baseline: number; mean: number; p10: number };
  const out: Row[] = [];

  for (const { id, i } of candidates) {
    // The hero's own baseline must be included. advantage() is defined relative
    // to it, so a bare sum of advantages carries a 5*(1 - WR_h) term that
    // systematically flatters weak heroes. What we want is the expected win
    // rate against this lineup, not a baseline-relative delta.
    const base = testSnap.baseline[i];
    const edges = new Float64Array(lineupIdx.length);
    for (let m = 0; m < lineupIdx.length; m++) {
      let e = base;
      for (const j of lineupIdx[m]) e += testSnap.advantage[i * n + j];
      edges[m] = e;
    }
    edges.sort();
    let sum = 0;
    for (let m = 0; m < edges.length; m++) sum += edges[m];
    out.push({
      id,
      exposure: engine.exposure(i),
      baseline: trainSnap.baseline[i],
      mean: sum / edges.length,
      p10: quantile(edges, 0.1),
    });
  }

  const exposure = out.map((r) => r.exposure);
  const baseline = out.map((r) => r.baseline);
  const p10 = out.map((r) => r.p10);
  const mean = out.map((r) => r.mean);

  console.log(`heroes evaluated: ${out.length}\n`);
  console.log('correlation (Spearman) against held-out outcomes');
  console.log(`  exposure  vs downside (p10) : ${spearman(exposure, p10).toFixed(3)}   expect strongly negative`);
  console.log(`  exposure  vs mean edge      : ${spearman(exposure, mean).toFixed(3)}`);
  console.log(`  baseline  vs downside (p10) : ${spearman(baseline, p10).toFixed(3)}`);
  console.log(`  baseline  vs mean edge      : ${spearman(baseline, mean).toFixed(3)}`);
  console.log('\nthe question that decides whether SAFE mode is a real differentiator:');
  console.log(
    `  exposure vs downside, baseline held constant : ${partial(exposure, p10, baseline).toFixed(3)}`,
  );
  console.log(
    `  baseline vs downside, exposure held constant : ${partial(baseline, p10, exposure).toFixed(3)}`,
  );

  // If exposure only tracks "this hero is weak", it is a worse tier list. The
  // salvageable version of the idea is punishability: spread between a hero's
  // typical game and its bad games, independent of how strong it is overall.
  const spread = out.map((r) => r.p10 - r.mean);
  console.log('\nis exposure measuring punishability rather than weakness?');
  console.log(`  exposure vs spread (p10 - mean) : ${spearman(exposure, spread).toFixed(3)}`);
  console.log(`  baseline vs spread (p10 - mean) : ${spearman(baseline, spread).toFixed(3)}`);
  console.log(
    `  exposure vs spread, baseline held constant : ${partial(exposure, spread, baseline).toFixed(3)}`,
  );

  /**
   * Reformulation. The shipped exposure weights each counter by how often it is
   * picked, which assumes a passive enemy — but first pick is exactly the case
   * where the enemy HAS information and can choose to punish. Depth-only drops
   * the pick-rate weighting and asks how hard the worst answers hit.
   */
  const depth = out.map(({ id }) => {
    const i = posOf.get(id)!;
    const threats: number[] = [];
    for (let j = 0; j < n; j++) if (j !== i) threats.push(trainSnap.advantage[j * n + i]);
    threats.sort((a, b) => b - a);
    return (threats[0] + threats[1] + threats[2]) / 3;
  });
  console.log('\nreformulation: worst-case depth, no pick-rate weighting');
  console.log(`  depth vs spread, baseline held constant   : ${partial(depth, spread, baseline).toFixed(3)}   want negative`);
  console.log(`  depth vs downside, baseline held constant : ${partial(depth, p10, baseline).toFixed(3)}   want negative`);

  // Head to head: what SAFE mode would offer vs what a tier list would offer.
  const bySafe = [...out].sort((a, b) => a.exposure - b.exposure).slice(0, 10);
  const byMeta = [...out].sort((a, b) => b.baseline - a.baseline).slice(0, 10);
  const avg = (rows: Row[], key: 'p10' | 'mean') =>
    rows.reduce((s, r) => s + r[key], 0) / rows.length;

  console.log('\ntop 10 by each strategy, scored on held-out data');
  console.log(`                      mean WR      downside (p10 WR)`);
  console.log(
    `  SAFE (low exposure) ${(avg(bySafe, 'mean') * 100).toFixed(2).padStart(9)}%   ${(avg(bySafe, 'p10') * 100).toFixed(2).padStart(9)}%`,
  );
  console.log(
    `  tier list (meta)    ${(avg(byMeta, 'mean') * 100).toFixed(2).padStart(9)}%   ${(avg(byMeta, 'p10') * 100).toFixed(2).padStart(9)}%`,
  );
  console.log(
    `  all candidates      ${(avg(out, 'mean') * 100).toFixed(2).padStart(9)}%   ${(avg(out, 'p10') * 100).toFixed(2).padStart(9)}%`,
  );

  console.log('\n  SAFE picks : ' + bySafe.map((r) => NAME.get(r.id)).join(', '));
  console.log('  tier list  : ' + byMeta.map((r) => NAME.get(r.id)).join(', '));
}

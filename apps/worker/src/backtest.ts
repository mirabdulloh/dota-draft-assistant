import { createEngine, type Snapshot } from '@dota/engine';
import type { Db } from './db.ts';
import { Aggregator } from './aggregate.ts';
import { buildSnapshot } from './snapshot.ts';
import type { PublicMatch } from './opendota.ts';

/**
 * Test matches must not contribute to the aggregates they are scored against,
 * or the advantage numbers already encode the answer. The split is on match_id
 * so it is deterministic and a rerun compares like with like.
 */
const TEST_EVERY = 5;
const isTest = (matchId: number) => matchId % TEST_EVERY === 0;

type Row = {
  match_id: string | number;
  avg_rank_tier: number | null;
  radiant_win: boolean;
  radiant_team: unknown;
  dire_team: unknown;
};

function arr(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string') return v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  return [];
}

async function* pages(db: Db, pageSize = 20_000): AsyncGenerator<Row[]> {
  let cursor = 0;
  for (;;) {
    const rows = await db.query<Row>(
      `SELECT match_id, avg_rank_tier, radiant_win, radiant_team, dire_team
       FROM matches WHERE match_id > $1 ORDER BY match_id LIMIT ${pageSize}`,
      [cursor],
    );
    if (rows.length === 0) return;
    yield rows;
    cursor = Number(rows[rows.length - 1].match_id);
    if (rows.length < pageSize) return;
  }
}

const bracketOf = (tier: number | null) =>
  tier == null ? 0 : Math.min(7, Math.max(1, Math.floor(tier / 10)));

export type BacktestWeights = { meta: number; counter: number; synergy: number };

export async function backtest(
  db: Db,
  opts: { k: number; patch: string; weights?: BacktestWeights },
): Promise<void> {
  const train = new Aggregator();
  const test: { bracket: number; radiant: number[]; dire: number[]; radiantWin: boolean }[] = [];

  for await (const rows of pages(db)) {
    for (const r of rows) {
      const matchId = Number(r.match_id);
      const radiant = arr(r.radiant_team);
      const dire = arr(r.dire_team);
      if (radiant.length !== 5 || dire.length !== 5 || r.avg_rank_tier == null) continue;

      if (isTest(matchId)) {
        test.push({
          bracket: bracketOf(r.avg_rank_tier),
          radiant,
          dire,
          radiantWin: r.radiant_win,
        });
      } else {
        train.add({
          match_id: matchId,
          start_time: 0,
          avg_rank_tier: r.avg_rank_tier,
          radiant_win: r.radiant_win,
          radiant_team: radiant,
          dire_team: dire,
        } as PublicMatch);
      }
    }
    process.stdout.write(`\r  train ${train.matchCount.toLocaleString()} / test ${test.length.toLocaleString()}`);
  }
  process.stdout.write('\n');

  const snapshots = new Map<number, Snapshot>();
  const engines = new Map<number, ReturnType<typeof createEngine>>();
  for (let b = 1; b <= 7; b++) {
    const snap = buildSnapshot(train, { bracket: b, k: opts.k, patch: opts.patch });
    snapshots.set(b, snap);
    engines.set(b, createEngine(snap));
  }

  const weightSets: Record<string, BacktestWeights> = opts.weights
    ? { custom: opts.weights }
    : {
        'meta only': { meta: 1, counter: 0, synergy: 0 },
        'counter only': { meta: 0, counter: 1, synergy: 0 },
        'synergy only': { meta: 0, counter: 0, synergy: 1 },
        'meta+counter': { meta: 1, counter: 1, synergy: 0 },
        'all equal': { meta: 1, counter: 1, synergy: 1 },
        'counter heavy': { meta: 1, counter: 3, synergy: 0.5 },
      };

  // Radiant wins slightly more than half of all Dota games, so "always Radiant"
  // is the baseline any real signal has to beat — not 50%.
  const radiantWins = test.filter((t) => t.radiantWin).length;
  const alwaysRadiant = (radiantWins / test.length) * 100;

  console.log(`\nheld-out matches: ${test.length.toLocaleString()}  (k=${opts.k})`);
  console.log(`baseline: always-Radiant ${alwaysRadiant.toFixed(2)}%  |  coin flip 50.00%\n`);
  console.log('weights              accuracy   vs baseline   decided');
  for (const [label, w] of Object.entries(weightSets)) {
    let correct = 0;
    let decided = 0;
    for (const t of test) {
      const engine = engines.get(t.bracket);
      if (!engine) continue;
      const edge = engine.predictRadiantEdge(t.radiant, t.dire, w);
      if (edge === 0) continue;
      decided++;
      if (edge > 0 === t.radiantWin) correct++;
    }
    const acc = decided ? (correct / decided) * 100 : 0;
    const lift = acc - alwaysRadiant;
    const flag = acc >= 60 ? '  <- too high, check for leakage' : acc >= 53 ? '  <- passes gate' : '';
    console.log(
      `${label.padEnd(20)} ${acc.toFixed(2)}%   ${(lift >= 0 ? '+' : '') + lift.toFixed(2)}pp`.padEnd(45) +
        `${decided.toLocaleString().padStart(9)}${flag}`,
    );
  }

  // Per-bracket, using the best general-purpose set.
  const w = opts.weights ?? { meta: 1, counter: 1, synergy: 1 };
  console.log('\nper bracket (all equal)   accuracy   matches');
  const names = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine'];
  for (let b = 1; b <= 7; b++) {
    const subset = test.filter((t) => t.bracket === b);
    if (subset.length === 0) continue;
    const engine = engines.get(b)!;
    let correct = 0;
    for (const t of subset) {
      const edge = engine.predictRadiantEdge(t.radiant, t.dire, w);
      if (edge > 0 === t.radiantWin) correct++;
    }
    console.log(
      `  ${names[b].padEnd(22)} ${((correct / subset.length) * 100).toFixed(2)}%   ${subset.length.toLocaleString().padStart(8)}`,
    );
  }
}

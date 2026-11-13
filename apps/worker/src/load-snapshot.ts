import type { Snapshot } from '@dota/engine';
import type { Db } from './db.ts';
import { heroIndex } from './snapshot.ts';

/**
 * Rebuilds a snapshot from the stored aggregates rather than from raw matches.
 * This is the path the API and the snapshot-export job use; the backtest builds
 * from an Aggregator instead so it can hold the test set out.
 */
export async function loadSnapshot(
  db: Db,
  opts: { bracket: number; patch: string },
): Promise<Snapshot> {
  const ids = heroIndex();
  const n = ids.length;
  const pos = new Map<number, number>(ids.map((id, i) => [id, i]));

  const baseline = new Float32Array(n).fill(0.5);
  const pickRate = new Float32Array(n);
  const advantage = new Float32Array(n * n);
  const advConfidence = new Float32Array(n * n);
  const synergy = new Float32Array(n * n);
  const synConfidence = new Float32Array(n * n);

  const stats = await db.query<{ hero_id: number; games: number; win_rate: number }>(
    `SELECT hero_id, games, win_rate FROM hero_stats WHERE bracket = $1 AND patch = $2`,
    [opts.bracket, opts.patch],
  );
  let appearances = 0;
  for (const s of stats) appearances += Number(s.games);
  const matches = Math.round(appearances / 10) || 1;
  for (const s of stats) {
    const i = pos.get(s.hero_id);
    if (i === undefined) continue;
    baseline[i] = Number(s.win_rate);
    pickRate[i] = Number(s.games) / matches;
  }

  const mu = await db.query<{ hero_id: number; vs_hero_id: number; advantage: number; confidence: number }>(
    `SELECT hero_id, vs_hero_id, advantage, confidence FROM matchups WHERE bracket = $1 AND patch = $2`,
    [opts.bracket, opts.patch],
  );
  for (const r of mu) {
    const i = pos.get(r.hero_id);
    const j = pos.get(r.vs_hero_id);
    if (i === undefined || j === undefined) continue;
    advantage[i * n + j] = Number(r.advantage);
    advConfidence[i * n + j] = Number(r.confidence);
  }

  const sy = await db.query<{ hero_id: number; with_hero_id: number; synergy: number; confidence: number }>(
    `SELECT hero_id, with_hero_id, synergy, confidence FROM synergies WHERE bracket = $1 AND patch = $2`,
    [opts.bracket, opts.patch],
  );
  for (const r of sy) {
    const i = pos.get(r.hero_id);
    const j = pos.get(r.with_hero_id);
    if (i === undefined || j === undefined) continue;
    synergy[i * n + j] = Number(r.synergy);
    synConfidence[i * n + j] = Number(r.confidence);
  }

  return {
    patch: opts.patch,
    bracket: opts.bracket,
    builtAt: new Date().toISOString(),
    matchesUsed: matches,
    heroIds: ids,
    baseline,
    pickRate,
    advantage,
    advConfidence,
    synergy,
    synConfidence,
  };
}

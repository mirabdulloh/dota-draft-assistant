import type { Snapshot } from '@dota/engine';
import type { Aggregator } from './aggregate.ts';
import { heroIndex } from './hero-index.ts';
import { buildPositionEligibility } from './role-mask.ts';

export { heroIndex };

export function buildSnapshot(
  agg: Aggregator,
  opts: { bracket: number; k: number; patch: string },
): Snapshot {
  const ids = heroIndex();
  const n = ids.length;
  const pos = new Map<number, number>(ids.map((id, i) => [id, i]));

  const baseline = new Float32Array(n).fill(0.5);
  const pickRate = new Float32Array(n);
  const advantage = new Float32Array(n * n);
  const advConfidence = new Float32Array(n * n);
  const synergy = new Float32Array(n * n);
  const synConfidence = new Float32Array(n * n);

  let bracketMatches = 0;
  for (const row of agg.heroStats()) {
    if (row.bracket !== opts.bracket) continue;
    const i = pos.get(row.hero_id);
    if (i === undefined) continue;
    baseline[i] = row.win_rate;
    bracketMatches += row.games;
  }
  // Ten hero appearances per match.
  bracketMatches = Math.round(bracketMatches / 10);

  for (const row of agg.heroStats()) {
    if (row.bracket !== opts.bracket) continue;
    const i = pos.get(row.hero_id);
    if (i === undefined || bracketMatches === 0) continue;
    pickRate[i] = row.games / bracketMatches;
  }

  for (const row of agg.matchupRows(opts.k)) {
    if (row.bracket !== opts.bracket) continue;
    const i = pos.get(row.hero_id);
    const j = pos.get(row.other_id);
    if (i === undefined || j === undefined) continue;
    advantage[i * n + j] = row.value;
    advConfidence[i * n + j] = row.confidence;
  }

  for (const row of agg.synergyRows(opts.k)) {
    if (row.bracket !== opts.bracket) continue;
    const i = pos.get(row.hero_id);
    const j = pos.get(row.other_id);
    if (i === undefined || j === undefined) continue;
    synergy[i * n + j] = row.value;
    synConfidence[i * n + j] = row.confidence;
  }

  return {
    patch: opts.patch,
    bracket: opts.bracket,
    builtAt: new Date().toISOString(),
    matchesUsed: bracketMatches,
    heroIds: ids,
    baseline,
    pickRate,
    advantage,
    advConfidence,
    synergy,
    synConfidence,
    positionEligible: buildPositionEligibility(),
  };
}

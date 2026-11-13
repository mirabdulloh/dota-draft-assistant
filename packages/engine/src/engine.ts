import type {
  DraftState,
  Mode,
  PickOrder,
  Snapshot,
  SuggestResult,
  Suggestion,
  Weights,
} from './types.ts';

export function modeFor(pickOrder: PickOrder): Mode {
  switch (pickOrder) {
    case 'first':
      return 'SAFE';
    case 'second':
    case 'third':
      return 'MIXED';
    case 'fourth':
      return 'COUNTER';
    case 'last':
      return 'HARD_COUNTER';
  }
}

/**
 * Starting weights from the design table. `counter` rises and `risk` falls as
 * more of the enemy draft becomes visible; on a first pick there is nothing to
 * counter, so the objective flips to minimising exposure instead.
 */
export const WEIGHTS: Record<Mode, Weights> = {
  SAFE: { role: 1, meta: 1.0, counter: 0, synergy: 0.5, risk: 1.0, flex: 1.0 },
  MIXED: { role: 1, meta: 1.0, counter: 0.5, synergy: 0.7, risk: 0.5, flex: 0.5 },
  COUNTER: { role: 1, meta: 0.8, counter: 1.0, synergy: 0.7, risk: 0.2, flex: 0 },
  HARD_COUNTER: { role: 1, meta: 0.6, counter: 1.5, synergy: 0.7, risk: 0, flex: 0 },
};

/** How many of a hero's worst matchups count toward SAFE-mode exposure. */
const EXPOSURE_TOP_N = 15;

export type EngineOptions = {
  weights?: Partial<Record<Mode, Partial<Weights>>>;
  heroName?: (heroId: number) => string;
  exposureTopN?: number;
};

export function createEngine(snapshot: Snapshot, options: EngineOptions = {}) {
  const n = snapshot.heroIds.length;
  const maxId = snapshot.heroIds.reduce((a, b) => (b > a ? b : a), 0);
  const indexOf = new Int16Array(maxId + 1).fill(-1);
  snapshot.heroIds.forEach((id, i) => {
    indexOf[id] = i;
  });

  const idx = (heroId: number) => (heroId <= maxId ? indexOf[heroId] : -1);
  const advantage = (i: number, j: number) => snapshot.advantage[i * n + j];
  const synergy = (i: number, j: number) => snapshot.synergy[i * n + j];
  const advConf = (i: number, j: number) => snapshot.advConfidence[i * n + j];
  const name = options.heroName ?? ((id: number) => `hero ${id}`);
  const topN = options.exposureTopN ?? EXPOSURE_TOP_N;

  /**
   * How badly a hero's common counters beat it, weighted by how often those
   * counters are actually picked. One devastating counter nobody picks is safe;
   * three mild counters everyone picks is a trap.
   */
  const exposureCache = new Float32Array(n).fill(NaN);
  function exposure(i: number): number {
    const cached = exposureCache[i];
    if (!Number.isNaN(cached)) return cached;
    const threats: number[] = [];
    for (let c = 0; c < n; c++) {
      if (c === i) continue;
      const adv = advantage(c, i);
      if (adv > 0) threats.push(adv * snapshot.pickRate[c]);
    }
    threats.sort((a, b) => b - a);
    let total = 0;
    for (let t = 0; t < Math.min(topN, threats.length); t++) total += threats[t];
    exposureCache[i] = total;
    return total;
  }

  /** Ability to be played in several positions — only meaningful with position data. */
  function flexibility(i: number): number {
    const pos = snapshot.positionWinRate;
    if (!pos) return 0;
    let played = 0;
    for (let p = 0; p < 5; p++) if (pos[i * 5 + p] > 0) played++;
    return played / 5;
  }

  function roleFit(i: number, position: number): number {
    const pos = snapshot.positionWinRate;
    if (!pos) return 0;
    return pos[i * 5 + (position - 1)] - snapshot.baseline[i];
  }

  function weightsFor(mode: Mode): Weights {
    return { ...WEIGHTS[mode], ...(options.weights?.[mode] ?? {}) };
  }

  function suggest(draft: DraftState, limit = 5): SuggestResult {
    const mode = modeFor(draft.pickOrder);
    const w = weightsFor(mode);

    const enemyIdx = draft.enemies.map(idx).filter((i) => i >= 0);
    const allyIdx = draft.allies.map(idx).filter((i) => i >= 0);
    const taken = new Set([...draft.enemies, ...draft.allies, ...draft.banned]);

    const missing: string[] = [];
    if (!snapshot.positionWinRate) {
      missing.push(
        snapshot.positionEligible
          ? 'position win rates (using coarse role filter)'
          : 'position data',
      );
    }

    const eligible = snapshot.positionEligible;
    const scored: Suggestion[] = [];
    for (let i = 0; i < n; i++) {
      const heroId = snapshot.heroIds[i];
      if (taken.has(heroId)) continue;
      if (eligible && eligible[i * 5 + (draft.myPosition - 1)] === 0) continue;

      let counter = 0;
      let risk = 0;
      let weakest = 1;
      for (const e of enemyIdx) {
        counter += advantage(i, e);
        risk += advantage(e, i);
        const c = advConf(i, e);
        if (c < weakest) weakest = c;
      }

      let syn = 0;
      for (const a of allyIdx) syn += synergy(i, a);

      const meta = snapshot.baseline[i] - 0.5;
      const exp = exposure(i);

      // SAFE has no enemies to counter, so the objective becomes minimising the
      // worst case rather than maximising advantage.
      const score =
        mode === 'SAFE'
          ? w.meta * meta + w.synergy * syn + w.flex * flexibility(i) + w.role * roleFit(i, draft.myPosition) - w.risk * exp
          : w.meta * meta +
            w.counter * counter +
            w.synergy * syn -
            w.risk * risk +
            w.flex * flexibility(i) +
            w.role * roleFit(i, draft.myPosition);

      scored.push({
        heroId,
        score,
        confidence: enemyIdx.length > 0 ? weakest : 1,
        reason: '',
        breakdown: { meta, counter, synergy: syn, risk, exposure: exp },
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, limit);
    const avoid = scored.slice(-3).reverse();
    for (const s of picks) s.reason = reasonFor(s, draft, mode);
    for (const s of avoid) s.reason = avoidReasonFor(s, draft);

    return { mode, picks, avoid, missing };
  }

  function reasonFor(s: Suggestion, draft: DraftState, mode: Mode): string {
    const i = idx(s.heroId);
    if (mode === 'SAFE') return 'safe pick, few common counters punish it';

    const beats = draft.enemies
      .map((id) => ({ id, adv: advantage(i, idx(id)) }))
      .filter((x) => x.adv > 0.01)
      .sort((a, b) => b.adv - a.adv)
      .slice(0, 2);
    if (beats.length > 0) return `beats their ${beats.map((b) => name(b.id)).join(', ')}`;

    const withAlly = draft.allies
      .map((id) => ({ id, syn: synergy(i, idx(id)) }))
      .filter((x) => x.syn > 0.005)
      .sort((a, b) => b.syn - a.syn)
      .slice(0, 1);
    if (withAlly.length > 0) return `strong with your ${name(withAlly[0].id)}`;

    return 'strong in this bracket right now';
  }

  function avoidReasonFor(s: Suggestion, draft: DraftState): string {
    const i = idx(s.heroId);
    const worst = draft.enemies
      .map((id) => ({ id, adv: advantage(idx(id), i) }))
      .sort((a, b) => b.adv - a.adv)[0];
    return worst && worst.adv > 0.01 ? `their ${name(worst.id)}` : 'weak into this lineup';
  }

  /**
   * Backtest predictor: positive means Radiant is favoured. Deliberately the
   * same lookups the draft scorer uses, so a good backtest validates the data
   * the suggestions are built on.
   */
  function predictRadiantEdge(
    radiant: number[],
    dire: number[],
    w: { meta: number; counter: number; synergy: number } = { meta: 1, counter: 1, synergy: 1 },
  ): number {
    const R = radiant.map(idx).filter((i) => i >= 0);
    const D = dire.map(idx).filter((i) => i >= 0);
    if (R.length === 0 || D.length === 0) return 0;

    let meta = 0;
    for (const r of R) meta += snapshot.baseline[r] - 0.5;
    for (const d of D) meta -= snapshot.baseline[d] - 0.5;

    let counter = 0;
    for (const r of R) for (const d of D) counter += advantage(r, d) - advantage(d, r);

    let syn = 0;
    for (let a = 0; a < R.length; a++)
      for (let b = a + 1; b < R.length; b++) syn += synergy(R[a], R[b]);
    for (let a = 0; a < D.length; a++)
      for (let b = a + 1; b < D.length; b++) syn -= synergy(D[a], D[b]);

    return w.meta * meta + w.counter * counter + w.synergy * syn;
  }

  return { suggest, exposure, predictRadiantEdge, modeFor, indexOf: idx, heroCount: n };
}

export type Engine = ReturnType<typeof createEngine>;

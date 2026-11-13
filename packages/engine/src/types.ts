/**
 * Everything the engine needs to score a draft, with no I/O. Matrices are flat
 * Float32Arrays indexed `i * heroCount + j` so the whole thing is a few hundred
 * KB and can be shipped to the phone and scored offline.
 */
export type Snapshot = {
  patch: string;
  bracket: number;
  builtAt: string;
  matchesUsed: number;
  /** Dense index -> Dota hero id. Hero ids are sparse (1..155), indices are not. */
  heroIds: number[];
  /** Win rate of each hero in this bracket. */
  baseline: Float32Array;
  /** Share of matches the hero appears in, 0..1. Drives SAFE-mode exposure. */
  pickRate: Float32Array;
  /** advantage(i against j) = adjustedWR(i | j enemy) - WR(i). */
  advantage: Float32Array;
  advConfidence: Float32Array;
  /** synergy(i with j) relative to the two heroes being independent. */
  synergy: Float32Array;
  synConfidence: Float32Array;
  /**
   * Win rate by position, `i * 5 + (pos - 1)`. Absent until a source with
   * position data is wired up — OpenDota's public match data has none.
   */
  positionWinRate?: Float32Array;
};

export type Position = 1 | 2 | 3 | 4 | 5;

export type PickOrder = 'first' | 'second' | 'third' | 'fourth' | 'last';

export type Mode = 'SAFE' | 'MIXED' | 'COUNTER' | 'HARD_COUNTER';

export type DraftState = {
  myPosition: Position;
  pickOrder: PickOrder;
  /** Hero ids already taken by the enemy. */
  enemies: number[];
  /** Hero ids already taken by my team, excluding my own pick. */
  allies: number[];
  banned: number[];
};

export type Weights = {
  role: number;
  meta: number;
  counter: number;
  synergy: number;
  /** Asymmetric with `counter`: how hard THEY counter ME. */
  risk: number;
  flex: number;
};

export type Suggestion = {
  heroId: number;
  score: number;
  /** 0..1, the weakest confidence among the terms that actually moved the score. */
  confidence: number;
  reason: string;
  breakdown: {
    meta: number;
    counter: number;
    synergy: number;
    risk: number;
    exposure?: number;
  };
};

export type SuggestResult = {
  mode: Mode;
  picks: Suggestion[];
  avoid: Suggestion[];
  /** Terms the snapshot could not supply, so the UI can say so rather than imply precision. */
  missing: string[];
};

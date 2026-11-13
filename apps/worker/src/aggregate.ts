import type { PublicMatch } from './opendota.ts';

/** Pseudo-count for beta-binomial shrinkage. Tune against the P2 backtest. */
export const DEFAULT_K = 300;

type Tally = { games: number; wins: number };

const bump = (m: Map<number, Tally>, key: number, won: boolean) => {
  let t = m.get(key);
  if (!t) {
    t = { games: 0, wins: 0 };
    m.set(key, t);
  }
  t.games++;
  if (won) t.wins++;
};

const heroKey = (hero: number, bracket: number) => hero * 10 + bracket;
const pairKey = (a: number, b: number, bracket: number) => (a * 200 + b) * 10 + bracket;

export type HeroStatRow = { hero_id: number; bracket: number; games: number; wins: number; win_rate: number };
export type PairRow = {
  hero_id: number;
  other_id: number;
  bracket: number;
  games: number;
  wins: number;
  value: number;
  confidence: number;
};

/**
 * Accumulates counts in memory as chunks stream in, rather than expanding
 * matches into rows in SQL. The cell count is bounded and small — at most
 * 127 x 127 x 7 per table — while SQL expansion would be 50 rows per match,
 * which is hundreds of millions of rows for a month of ingest.
 */
export class Aggregator {
  private heroes = new Map<number, Tally>();
  private matchups = new Map<number, Tally>();
  private synergies = new Map<number, Tally>();
  matchCount = 0;

  add(m: PublicMatch): void {
    if (m.avg_rank_tier == null) return;
    const bracket = Math.min(7, Math.max(1, Math.floor(m.avg_rank_tier / 10)));
    const rWon = m.radiant_win;
    const R = m.radiant_team;
    const D = m.dire_team;
    this.matchCount++;

    for (const h of R) bump(this.heroes, heroKey(h, bracket), rWon);
    for (const h of D) bump(this.heroes, heroKey(h, bracket), !rWon);

    for (const r of R) {
      for (const d of D) {
        bump(this.matchups, pairKey(r, d, bracket), rWon);
        bump(this.matchups, pairKey(d, r, bracket), !rWon);
      }
    }

    for (const team of [R, D]) {
      const won = team === R ? rWon : !rWon;
      for (let i = 0; i < team.length; i++) {
        for (let j = 0; j < team.length; j++) {
          if (i === j) continue;
          bump(this.synergies, pairKey(team[i], team[j], bracket), won);
        }
      }
    }
  }

  heroStats(): HeroStatRow[] {
    const out: HeroStatRow[] = [];
    for (const [key, t] of this.heroes) {
      out.push({
        hero_id: Math.floor(key / 10),
        bracket: key % 10,
        games: t.games,
        wins: t.wins,
        win_rate: t.wins / t.games,
      });
    }
    return out;
  }

  private baseline(): Map<number, number> {
    const wr = new Map<number, number>();
    for (const [key, t] of this.heroes) wr.set(key, t.wins / t.games);
    return wr;
  }

  /** advantage(A,B) = adjustedWR(A|B on enemy team) - WR(A), shrunk toward WR(A). */
  matchupRows(k = DEFAULT_K): PairRow[] {
    const wr = this.baseline();
    const out: PairRow[] = [];
    for (const [key, t] of this.matchups) {
      const bracket = key % 10;
      const pair = (key - bracket) / 10;
      const hero = Math.floor(pair / 200);
      const other = pair % 200;
      const base = wr.get(heroKey(hero, bracket));
      if (base === undefined) continue;
      const adjusted = (t.wins + k * base) / (t.games + k);
      out.push({
        hero_id: hero,
        other_id: other,
        bracket,
        games: t.games,
        wins: t.wins,
        value: adjusted - base,
        confidence: t.games / (t.games + k),
      });
    }
    return out;
  }

  /**
   * Synergy shrinks toward what the pair would do if the two heroes were
   * independent (WR_A + WR_B - 0.5), not toward WR_A alone — otherwise two
   * individually strong heroes look synergistic merely for being strong.
   */
  synergyRows(k = DEFAULT_K): PairRow[] {
    const wr = this.baseline();
    const out: PairRow[] = [];
    for (const [key, t] of this.synergies) {
      const bracket = key % 10;
      const pair = (key - bracket) / 10;
      const hero = Math.floor(pair / 200);
      const other = pair % 200;
      const a = wr.get(heroKey(hero, bracket));
      const b = wr.get(heroKey(other, bracket));
      if (a === undefined || b === undefined) continue;
      const expected = a + b - 0.5;
      const adjusted = (t.wins + k * expected) / (t.games + k);
      out.push({
        hero_id: hero,
        other_id: other,
        bracket,
        games: t.games,
        wins: t.wins,
        value: adjusted - expected,
        confidence: t.games / (t.games + k),
      });
    }
    return out;
  }
}

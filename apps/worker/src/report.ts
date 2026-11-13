import { heroes } from 'dotaconstants';
import type { Db } from './db.ts';

const NAME = new Map<number, string>(
  Object.values(heroes as Record<string, { id: number; localized_name: string }>).map((h) => [
    h.id,
    h.localized_name,
  ]),
);
const name = (id: number) => NAME.get(id) ?? `#${id}`;

const BRACKET = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine'];

/** Heroes whose counters are well known, so the output can be sanity-checked by eye. */
const SAMPLE = [1, 44, 35];

export async function report(db: Db, patch: string): Promise<void> {
  const [counts] = await db.query<{ n: string; oldest: string; newest: string }>(
    `SELECT count(*) AS n,
            to_char(to_timestamp(min(start_time)), 'YYYY-MM-DD HH24:MI') AS oldest,
            to_char(to_timestamp(max(start_time)), 'YYYY-MM-DD HH24:MI') AS newest
     FROM matches`,
  );
  console.log(`matches stored : ${Number(counts.n).toLocaleString()}`);
  console.log(`window         : ${counts.oldest} .. ${counts.newest} UTC\n`);

  const brackets = await db.query<{ bracket: number; n: string }>(
    `SELECT bracket, count(*) AS n FROM matches GROUP BY bracket ORDER BY bracket`,
  );
  console.log('bracket      matches');
  for (const b of brackets) {
    console.log(`  ${BRACKET[b.bracket]?.padEnd(10) ?? b.bracket}  ${Number(b.n).toLocaleString().padStart(9)}`);
  }

  const [conf] = await db.query<{
    n: string;
    med: number;
    p90: number;
    strong: string;
    maxgames: string;
  }>(
    `SELECT count(*) AS n,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY confidence) AS med,
            percentile_cont(0.9) WITHIN GROUP (ORDER BY confidence) AS p90,
            count(*) FILTER (WHERE confidence > 0.5) AS strong,
            max(games) AS maxgames
     FROM matchups WHERE patch = $1`,
    [patch],
  );
  if (conf && Number(conf.n) > 0) {
    console.log(`\nmatchup cells  : ${Number(conf.n).toLocaleString()}`);
    console.log(`confidence     : median ${Number(conf.med).toFixed(3)}, p90 ${Number(conf.p90).toFixed(3)}`);
    console.log(
      `  above 0.5    : ${Number(conf.strong).toLocaleString()} (${((Number(conf.strong) / Number(conf.n)) * 100).toFixed(1)}%)`,
    );
    console.log(`  max games/cell: ${Number(conf.maxgames).toLocaleString()}`);
  }

  for (const hero of SAMPLE) {
    const rows = await db.query<{
      vs_hero_id: number;
      advantage: number;
      games: number;
      confidence: number;
    }>(
      `SELECT vs_hero_id, advantage, games, confidence
       FROM matchups
       WHERE hero_id = $1 AND patch = $2 AND bracket = $3 AND games > 50
       ORDER BY advantage DESC`,
      [hero, patch, 5],
    );
    if (rows.length === 0) continue;
    console.log(`\n${name(hero)} — Legend bracket, ${rows.length} matchups with >50 games`);
    console.log('  best against                     adv    games   conf');
    for (const r of rows.slice(0, 5)) {
      console.log(
        `    ${name(r.vs_hero_id).padEnd(24)} ${(r.advantage * 100).toFixed(2).padStart(7)}%  ${String(r.games).padStart(6)}  ${r.confidence.toFixed(2)}`,
      );
    }
    console.log('  worst against');
    for (const r of rows.slice(-5).reverse()) {
      console.log(
        `    ${name(r.vs_hero_id).padEnd(24)} ${(r.advantage * 100).toFixed(2).padStart(7)}%  ${String(r.games).padStart(6)}  ${r.confidence.toFixed(2)}`,
      );
    }
  }
}

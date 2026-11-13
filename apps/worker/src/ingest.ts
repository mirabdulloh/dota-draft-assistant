import type { Db } from './db.ts';
import { SCHEMA } from './schema.ts';
import { latestMatchId, streamMatches, type PublicMatch } from './opendota.ts';
import { Aggregator, DEFAULT_K, type PairRow } from './aggregate.ts';

/** Rows newer than this are often not yet backfilled by OpenDota. */
const BACKFILL_LAG_MATCH_IDS = 1_000_000;

const INSERT_CHUNK = 500;

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}

async function insertMatches(db: Db, rows: PublicMatch[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    for (const r of chunk) {
      const n = params.length;
      values.push(`($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6},$${n + 7})`);
      params.push(
        Number(r.match_id),
        Number(r.start_time),
        r.avg_rank_tier,
        r.avg_rank_tier == null ? null : Math.min(7, Math.max(1, Math.floor(r.avg_rank_tier / 10))),
        r.radiant_win,
        `{${r.radiant_team.join(',')}}`,
        `{${r.dire_team.join(',')}}`,
      );
    }
    await db.query(
      `INSERT INTO matches (match_id, start_time, avg_rank_tier, bracket, radiant_win, radiant_team, dire_team)
       VALUES ${values.join(',')} ON CONFLICT (match_id) DO NOTHING`,
      params,
    );
  }
}

export async function ingest(
  db: Db,
  opts: { matches: number; batchSize: number },
): Promise<{ added: number; from: number; to: number }> {
  const head = await latestMatchId();
  const to = head - BACKFILL_LAG_MATCH_IDS;
  // Measured yield of ranked All Pick with a usable rank tier is ~35% of the id
  // range. Over-scanning is free: the stream stops once the target is reached.
  const from = to - Math.ceil(opts.matches / 0.3);

  console.log(`head match_id      ${head}`);
  console.log(`ingest range       ${from} .. ${to}  (target ${opts.matches.toLocaleString()} matches)`);

  const run = await db.query<{ id: number }>(
    `INSERT INTO ingest_runs (from_match_id, to_match_id) VALUES ($1,$2) RETURNING id`,
    [from, to],
  );

  let added = 0;
  for await (const batch of streamMatches({ fromMatchId: from, toMatchId: to, batchSize: opts.batchSize })) {
    await insertMatches(db, batch);
    added += batch.length;
    process.stdout.write(`\r  ingested ${added.toLocaleString()} matches`);
    if (added >= opts.matches) break;
  }
  process.stdout.write('\n');

  await db.query(`UPDATE ingest_runs SET finished_at = now(), matches_added = $2 WHERE id = $1`, [
    run[0].id,
    added,
  ]);
  return { added, from, to };
}

async function writePairs(
  db: Db,
  table: 'matchups' | 'synergies',
  otherCol: 'vs_hero_id' | 'with_hero_id',
  valueCol: 'advantage' | 'synergy',
  rows: PairRow[],
  patch: string,
): Promise<void> {
  await db.query(`DELETE FROM ${table} WHERE patch = $1`, [patch]);
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    for (const r of chunk) {
      const n = params.length;
      values.push(`($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6},$${n + 7},$${n + 8})`);
      params.push(r.hero_id, r.other_id, r.bracket, patch, r.games, r.wins, r.value, r.confidence);
    }
    await db.query(
      `INSERT INTO ${table} (hero_id, ${otherCol}, bracket, patch, games, wins, ${valueCol}, confidence)
       VALUES ${values.join(',')}`,
      params,
    );
  }
}

export async function aggregate(
  db: Db,
  opts: { patch: string; k: number },
): Promise<{ matches: number; heroStats: number; matchups: number; synergies: number }> {
  const agg = new Aggregator();
  const PAGE = 20_000;
  let cursor = 0;

  for (;;) {
    const rows = await db.query<PublicMatch>(
      `SELECT match_id, start_time, avg_rank_tier, radiant_win, radiant_team, dire_team
       FROM matches WHERE match_id > $1 ORDER BY match_id LIMIT ${PAGE}`,
      [cursor],
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      agg.add({
        ...r,
        match_id: Number(r.match_id),
        radiant_team: normaliseArray(r.radiant_team),
        dire_team: normaliseArray(r.dire_team),
      });
    }
    cursor = Number(rows[rows.length - 1].match_id);
    process.stdout.write(`\r  aggregated ${agg.matchCount.toLocaleString()} matches`);
    if (rows.length < PAGE) break;
  }
  process.stdout.write('\n');

  const heroStats = agg.heroStats();
  await db.query(`DELETE FROM hero_stats WHERE patch = $1`, [opts.patch]);
  for (let i = 0; i < heroStats.length; i += INSERT_CHUNK) {
    const chunk = heroStats.slice(i, i + INSERT_CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    for (const r of chunk) {
      const n = params.length;
      values.push(`($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6})`);
      params.push(r.hero_id, r.bracket, opts.patch, r.games, r.wins, r.win_rate);
    }
    await db.query(
      `INSERT INTO hero_stats (hero_id, bracket, patch, games, wins, win_rate) VALUES ${values.join(',')}`,
      params,
    );
  }

  const matchups = agg.matchupRows(opts.k);
  const synergies = agg.synergyRows(opts.k);
  await writePairs(db, 'matchups', 'vs_hero_id', 'advantage', matchups, opts.patch);
  await writePairs(db, 'synergies', 'with_hero_id', 'synergy', synergies, opts.patch);

  return {
    matches: agg.matchCount,
    heroStats: heroStats.length,
    matchups: matchups.length,
    synergies: synergies.length,
  };
}

/** pg returns int[] as numbers; PGlite can hand back the raw `{1,2,3}` literal. */
function normaliseArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string') return v.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  throw new Error(`cannot read array from ${typeof v}`);
}

export { DEFAULT_K };

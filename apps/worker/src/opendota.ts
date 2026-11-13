const EXPLORER = 'https://api.opendota.com/api/explorer';

/** Free tier allows 60 req/min; stay comfortably under it. */
const MIN_REQUEST_GAP_MS = 1100;

export type PublicMatch = {
  match_id: number;
  start_time: number;
  avg_rank_tier: number | null;
  radiant_win: boolean;
  radiant_team: number[];
  dire_team: number[];
};

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** The explorer executes raw SQL, so every interpolated value must be proven numeric. */
function int(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer, got ${value}`);
  }
  return value;
}

async function runSql<T>(sql: string, attempts = 4): Promise<T[]> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    await throttle();
    try {
      const res = await fetch(`${EXPLORER}?sql=${encodeURIComponent(sql)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { err?: string; rows?: T[] };
      if (body.err) throw new Error(String(body.err));
      return body.rows ?? [];
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw new Error(`explorer query failed after ${attempts} attempts: ${lastErr}`);
}

export async function latestMatchId(): Promise<number> {
  const rows = await runSql<{ max: string }>(
    'SELECT max(match_id) AS max FROM public_matches',
  );
  return Number(rows[0].max);
}

/**
 * Keyset pagination over a bounded match_id range. Bounded because unbounded
 * aggregates and scans on public_matches hit the explorer's read timeout.
 *
 * Rows newer than roughly a day are not yet backfilled — they arrive with
 * avg_rank_tier null and all-zero team arrays — so those are filtered out here
 * rather than being stored and cleaned up later.
 */
export async function* streamMatches(opts: {
  fromMatchId: number;
  toMatchId: number;
  batchSize: number;
}): AsyncGenerator<PublicMatch[]> {
  const to = int('toMatchId', opts.toMatchId);
  const batch = int('batchSize', opts.batchSize);
  let cursor = int('fromMatchId', opts.fromMatchId);

  for (;;) {
    const sql = `
      SELECT match_id, start_time, avg_rank_tier, radiant_win, radiant_team, dire_team
      FROM public_matches
      WHERE match_id > ${cursor} AND match_id <= ${to}
        AND game_mode = 22
        AND avg_rank_tier IS NOT NULL
        AND radiant_team IS NOT NULL AND dire_team IS NOT NULL
        AND NOT (0 = ANY(radiant_team)) AND NOT (0 = ANY(dire_team))
        AND cardinality(radiant_team) = 5 AND cardinality(dire_team) = 5
      ORDER BY match_id
      LIMIT ${batch}
    `;
    const rows = await runSql<PublicMatch>(sql);
    if (rows.length === 0) return;
    yield rows;
    cursor = Number(rows[rows.length - 1].match_id);
    if (rows.length < batch) return;
  }
}

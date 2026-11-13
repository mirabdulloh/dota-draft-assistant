# @dota/worker — data ingestion

Builds the quantitative layer: hero baselines, matchups and synergies, from OpenDota's
public match data.

## Why it works this way

OpenDota's `/heroes/{id}/matchups` endpoint — the source the original plan named — returns
only 24–78 games per hero pair. Run through beta-binomial shrinkage at `k = 300` that is
7–21% confidence, which collapses every `advantage` toward zero and turns the engine into a
tier list. See `spikes/data/FINDINGS.md`.

Instead we aggregate ourselves from `public_matches` via OpenDota's SQL explorer, which
carries `radiant_team[5]`, `dire_team[5]`, `avg_rank_tier` and `radiant_win` for roughly
390,000 ranked All Pick matches per day.

The same table is the P2 backtest set — ten hero ids plus who won is literally a backtest
row — so validation needs no separate data pull.

## Commands

```bash
npm run rebuild -w @dota/worker -- --matches 2000000   # ingest + aggregate from scratch
npm run ingest  -w @dota/worker -- --matches 500000    # download only
npm run aggregate -w @dota/worker -- --k 300           # recompute without re-downloading
npm run report  -w @dota/worker                        # inspect what is stored
```

`ingest` and `aggregate` are separate so `k` can be retuned against the backtest without
re-downloading anything.

## Database

Without `DATABASE_URL` it runs **PGlite** — Postgres 16 compiled to WASM — in `.data/pg`,
so the pipeline runs with nothing installed. The SQL is plain Postgres either way.

For real volume use a real server:

```bash
docker compose -f infra/docker-compose.yml up -d
export DATABASE_URL=postgres://dota:dota@localhost:5432/dota_draft
```

## How much data is enough

Each match yields 50 matchup observations (5x5, both directions) spread over 7 brackets and
16,002 ordered hero pairs. Confidence is `games / (games + k)`.

Measured, not estimated:

| Matches | median confidence | cells above 0.5 | max games/cell | wall clock |
|---|---|---|---|---|
| 20,000 | 0.013 | 0% | 120 | ~5s |
| 321,000 | 0.185 | 12.8% | 3,528 | 30s |
| 2,000,000 | **0.583** | 59.2% | 21,909 | 2m26s |

Extrapolating from the 2M point (~419 games per median cell), reaching a median confidence
of 0.8 needs roughly 5.7M matches and 0.9 needs roughly 13M — the latter is about 26 days of
play, near a full patch window.

**2M is already usable.** At that level the heavily-contested pairs sit at 0.9+ and the
matchups reproduce known Dota: Anti-Mage's worst are Bloodseeker and Meepo, his best include
Medusa (mana burn versus mana shield); Phantom Assassin's worst are Omniknight and Nyx
Assassin. Nothing told the pipeline that.

At 20,000 rows per request, 2M matches is ~100 requests — trivial against the 50,000/month
free budget. The constraint is local aggregation time, not the API.

## Known constraints

- Unbounded aggregates on the explorer hit a read timeout; every query is bounded by a
  `match_id` range.
- Matches from roughly the last day are not yet backfilled (`radiant_team` comes back as
  all zeros), so ingest deliberately lags behind the head of the table.
- **Immortal is not available.** `avg_rank_tier` tops out at 75 and Immortal games are
  folded into the Divine bucket. High-MMR data requires STRATZ.
- There is no position data here at all — `public_matches` does not carry it. Per-position
  win rates need STRATZ, and the draft engine treats them as mandatory.

# SPIKE-DATA — findings

**Date:** 2026-11-13
**Question:** do the planned data sources actually supply what the scoring engine needs?
**Verdict:** one plan assumption is **wrong and would have broken the engine**. There is a
clean fix, and it also solves the P2 backtest data problem.

---

## 1. The plan's core counter source does not work

The brief names OpenDota `/heroes/{id}/matchups` as *"Raw hero-vs-hero games_played + wins —
the core counter signal."* It is far too thin to be that.

| Hero | Total games across all 126 matchups | Median per matchup | Max |
|---|---|---|---|
| Anti-Mage | 3,280 | 24 | 79 |
| Juggernaut | 7,115 | 45 | 194 |
| Largo | 8,315 | 57 | 202 |
| Pudge | 11,175 | 72 | 345 |
| Invoker | 12,105 | 78 | 392 |

Run those through the brief's own shrinkage with `k = 300`:

```
confidence = games / (games + k)
   24 games -> 0.074
   78 games -> 0.206
```

Every matchup would retain 7–21% of its signal and `advantage(A,B)` would collapse toward
zero across the board. The engine would emit **meta strength only — a tier list.** Precisely
the thing the product is defined as not being. This is a silent failure: nothing errors, the
numbers just quietly stop meaning anything.

## 2. The fix: build the matchup table ourselves from `public_matches`

OpenDota exposes a SQL endpoint, `GET /api/explorer?sql=...`, free and keyless. The
`public_matches` table carries exactly what we need:

```
match_id, start_time, avg_rank_tier, radiant_win,
radiant_team[5], dire_team[5],     -- hero ID arrays
game_mode, lobby_type              -- 22 = All Draft, lobby 7 = Ranked
```

Volume, measured over a one-day `match_id` window (9079000000–9080000000, 2026-11-06→07):

| | count |
|---|---|
| matches in window | 645,766 |
| All Pick (`game_mode = 22`) | 390,943 |
| with a rank tier | 543,753 |

**~390k ranked All Pick matches per day.** Each match yields 25 hero-vs-hero observations
(5×5), so one month of ingest gives roughly 18,000 games per ordered hero pair, or ~2,600 per
pair *per bracket*. That is `confidence` 0.90–0.98 — full signal, which is what the shrinkage
formula was designed for.

This single table also yields, from the same ingest:
- **synergies** (same-team pairs),
- **the P2 backtest set** (final 10 heroes + `radiant_win` is literally the backtest row),
- **patch filtering** via `start_time`,
- **bracket filtering** via `avg_rank_tier`.

So the previously-flagged "data budget may block P2" risk is resolved: we are not paying per
match, and the backtest set falls out of the matchup ingest for free.

### Explorer constraints

- Unbounded aggregates **time out** (`Error: Query read timeout`). Bound every query by a
  `match_id` range.
- Bounded aggregates over a ~1M `match_id` range (about one day) return in seconds, including
  `GROUP BY`. Aggregate server-side in daily chunks rather than downloading raw rows.
- Very recent rows are not yet backfilled — `radiant_team` comes back `[0,0,0,0,0]` and
  `avg_rank_tier` null for roughly the last few hours. **Ingest should lag ~24h.**

## 3. Immortal data is not available from OpenDota

`heroStats` bracket 8 is empty — 0 picks across all 127 heroes. And in `public_matches`,
`avg_rank_tier >= 80` returns 0 rows, while the top observed bucket (75, Divine 5) holds
17,918 matches against 4,768 at tier 74. That spike means **Immortal games are collapsed into
the top bucket, not represented as their own bracket.**

All Pick matches per day by bracket:

| Bracket | ~matches/day |
|---|---|
| Herald | 7,268 |
| Guardian | 24,684 |
| Crusader | 48,603 |
| Archon | 81,898 |
| Legend | 101,011 |
| Ancient | 57,295 |
| Divine (incl. collapsed Immortal) | 39,872 |

**Consequence:** if the target bracket is Immortal, OpenDota cannot serve it and STRATZ
becomes mandatory rather than merely preferred. Anywhere from Herald to Divine, OpenDota
alone is more than sufficient.

## 4. Constants: npm lags, GitHub is live

| | heroes | newest | facets | last updated |
|---|---|---|---|---|
| npm `dotaconstants` 10.8.0 | 127 | Largo (155) | none | published 2026-03-25 |
| GitHub `odota/dotaconstants` master | 127 | Largo (155) | none | **2026-11-13** |

Rosters are identical today, so npm is not currently wrong — but its `patch.json` stops at
7.41 base with no knowledge of 7.41a–f, and it will lag whenever 7.42 ships a hero. GitHub
master is updated continuously (it gained a `NameAliases` field yesterday that npm lacks).
**Track the GitHub repo, not the npm package.**

Facets: confirmed absent in both, and absent from OpenDota `heroStats`. The brief's claim that
7.41 removed them holds.

## 5. heroStats shape, for the record

127 entries. Per-bracket `1_pick`/`1_win` … `8_pick`/`8_win` (8 always empty), plus
`pub_pick`/`pub_win`, `pub_pick_trend` (7 buckets, summing exactly to `pub_pick`, last one
partial), `turbo_*`, and `pro_pick`/`pro_ban`/`pro_win`.

**Pro data is unusable as a signal:** 2,060 pro picks in total across all 127 heroes.
Fine for a "contested in pro play" flag, useless for counters.

There is **no patch field anywhere in heroStats**, and no way to filter it by patch. Another
reason to derive our own aggregates from `public_matches`, where `start_time` lets us cut
cleanly at a patch boundary.

---

## What this changes in the plan

1. Drop `/heroes/{id}/matchups` as a source. Derive `matchups` and `synergies` from
   `public_matches` via the explorer, aggregated server-side in daily `match_id` chunks.
2. The P1 gate ("one command rebuilds the whole dataset") now means: iterate daily chunks
   since the patch boundary, aggregate, write. No per-match API spend.
3. The P2 backtest set comes from the same ingest — no separate data pull.
4. Ingest must lag ~24h behind live to avoid unbackfilled rows.
5. Bracket choice is now partly a data question, not only a taste question: Immortal is not
   available from OpenDota.

## Still blocked

**STRATZ.** The brief makes per-position data mandatory — a hero's pos-5 win rate tells you
nothing about its pos-1 win rate — and `public_matches` has no position information at all.
STRATZ remains the only free source for it, and it is also the only route to Immortal.

Registering the API key creates an account, so that one needs to be done by the project owner
rather than by me. Once the key exists, the remaining checks are: per-position win rates for
5 heroes, whether position-split matchup data is exposed, and the real rate limit.

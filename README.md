# Dota 2 Draft Assistant

A phone app used while drafting in Dota 2 on PC. You give it your position and pick slot, it
reads the enemy draft, and it suggests heroes with a reason for each — then, once the draft
is done, item builds against that specific lineup.

It is **not a tier list**: a tier list does not change when the enemy picks, and these
suggestions have to. It is **not automation or a cheat** — read-only, public data only.

> Not created, sponsored, or endorsed by Valve Corporation. Dota 2 is a registered trademark
> of Valve Corporation. Hero portraits are hot-linked from Valve's CDN and are not
> redistributed by this project.

## Status

Engine and data pipeline work and are validated. No app yet.

| Phase | State |
|---|---|
| P0 — OCR and data spikes | done, both passed |
| P1 — ingest worker | done |
| P2 — scoring engine + backtest | done, **56.99%** on held-out matches |
| P3 — Expo app | not started |
| P4 — item engine | not started |
| P5 — camera integration | not started |

## What's here

```
apps/worker/      ingestion, aggregation, backtest, SAFE-mode validation
packages/engine/  pure scoring engine — zero I/O, zero dependencies
spikes/ocr/       hero recognition from draft screenshots
spikes/data/      data source evaluation
infra/            docker-compose for Postgres and Redis
```

## Results so far

**Hero recognition works.** A downscaled normalised RGB grid with nearest-neighbour
matching identifies all 127 heroes at 100% down to 16px wide, no ML. Against a real 4K All
Pick draft screen it got 9/9 filled slots on the first try and correctly flagged the empty
slot. [Details](spikes/ocr/FINDINGS.md).

**The planned counter data source didn't work.** OpenDota's `/heroes/{id}/matchups` returns
24–78 games per hero pair, which shrinkage reduces to near-zero signal. Matchups are instead
derived from the `public_matches` SQL table — ~390k ranked All Pick matches per day.
[Details](spikes/data/FINDINGS.md).

**The engine beats the baseline.** 56.99% winner prediction on 399,312 held-out matches
against an always-Radiant baseline of 52.75%. The counter term outscores the meta term,
which is the evidence that suggestions react to the enemy draft rather than restating hero
strength. [Details](packages/engine/README.md).

**The first-pick differentiator failed its own test.** SAFE mode's `exposure` ranking adds
nothing beyond hero win rate, and a plain tier list beats it on both average and worst case.
Documented rather than quietly dropped. [Details](packages/engine/SAFE-MODE.md).

## Running it

```bash
npm install
npm run rebuild -w @dota/worker -- --matches 2000000
npm run backtest -w @dota/worker
npm run demo -w @dota/worker
```

No database setup needed — it runs on PGlite (Postgres compiled to WASM) by default. Set
`DATABASE_URL` to use a real server.

## Data sources

- [dotaconstants](https://github.com/odota/dotaconstants) — hero and item definitions
- [OpenDota API](https://docs.opendota.com/) — public match data

## License

Not yet chosen.

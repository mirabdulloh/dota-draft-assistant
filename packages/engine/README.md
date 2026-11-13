# @dota/engine

Pure scoring engine. Zero I/O, zero dependencies. Takes a `Snapshot` plus a `DraftState` and
returns ranked suggestions. The same code runs in the backtest, in the API, and offline on
the phone.

## P2 gate: PASSED

Backtested on **399,312 held-out matches** (20% of a 2M-match ingest, split on `match_id`).
The aggregates are built from the training 80% only — a test match never contributes to the
numbers it is scored against.

```
baseline: always-Radiant 52.75%   coin flip 50.00%

weights              accuracy   vs baseline
meta only            55.75%     +3.00pp
counter only         56.86%     +4.11pp
synergy only         51.83%     -0.92pp
meta + counter       56.83%     +4.08pp
all equal            56.99%     +4.24pp     <- best
counter heavy        56.89%     +4.14pp
```

**56.99%**, inside the 53–55%+ "genuinely useful" band and below the 60% that would indicate
leakage. Accuracy is flat across brackets (Herald 55.8% → Legend 57.2% → Divine 56.4%).

Three things worth taking from that table:

1. **Always-Radiant is 52.75%, not 50%.** Radiant wins more often, so the honest headline is
   **+4.24pp of real signal**, not "+7 over a coin flip".
2. **The counter term beats the meta term** (56.86% vs 55.75%). That matters more than the
   headline: meta strength is constant no matter what the enemy picks, so the counter term is
   the only part that *moves* with the draft — and it is the stronger of the two. This is the
   empirical case that the product is not a tier list.
3. **Synergy is doing nothing.** Alone it scores *below* the always-Radiant baseline, and it
   adds +0.16pp over meta+counter. Either the formula is wrong or pub synergy genuinely
   carries little signal. It is kept because it is free, but no feature should lean on it
   until this is understood.

`k` is not a sensitive parameter: 100, 300 and 1000 all land within 0.05pp. Don't spend time
tuning it.

## It reacts to the enemy draft

Same slot, same allies, same position — only the enemy lineup differs:

```
enemy: Lina, Lion, Axe, Zeus, Tidehunter      enemy: Spectre, PL, Medusa, TB, Naga
  1. Razor          beats Tidehunter, Lina      1. Anti-Mage     beats Medusa, Terrorblade
  2. Lifestealer    beats Tidehunter, Axe       2. Tidehunter    beats Terrorblade, Naga
  3. Sven           beats Tidehunter, Lina      3. Nyx Assassin  beats Terrorblade, Medusa
```

Against magic burst it reaches for BKB-carriers and high-HP cores. Against five illusion and
carry heroes it reaches for AoE clear — Tidehunter, Underlord, Earthshaker — and Anti-Mage
into Medusa's mana pool. Nothing encoded those rules; they fall out of the matchup counts.

Scoring takes **0.15–1.8ms** against the 16ms budget, with no I/O.

## Snapshot format

Flat `Float32Array` matrices indexed `i * heroCount + j`, hero index order fixed by
dotaconstants so indices stay stable between patches. At 127 heroes each matrix is 64KB, so
a full single-bracket snapshot is roughly 320KB before compression — small enough to ship to
the phone and score entirely offline.

## Modes

Pick order selects the mode, and SAFE changes the objective rather than just the weights:

| Pick order | Mode | Objective |
|---|---|---|
| first | `SAFE` | minimise `exposure` — no enemies exist to counter |
| 2nd–3rd | `MIXED` | balanced |
| 4th | `COUNTER` | counter what is visible |
| last | `HARD_COUNTER` | maximise advantage, risk weight ~0 |

```
exposure(h) = sum over h's top-15 counters of  advantage(counter, h) * pickRate(counter)
```

A hero with one devastating counter nobody picks is safe; three mild counters everyone picks
is a trap. Ranked ascending.

## Known gaps

- **No position win rates.** `roleFit` and `flexibility` return 0 and `suggest()` reports
  `missing: ['position win rates (using coarse role filter)']` rather than inventing a
  number. Neither OpenDota's `public_matches` nor its `player_matches` can supply positions
  at usable volume (0.002% parse coverage — see `spikes/data/FINDINGS.md`). This needs STRATZ.

  In the meantime `snapshot.positionEligible` carries a coarse 1/0 mask derived from Valve's
  `roles` metadata. It **gates candidates and contributes no score**, so it cannot fabricate
  a number. Eligible heroes per position: 72 / 118 / 106 / 62 / 48.

  What it fixes: asking for position 5 no longer returns five hard carries.

  What it cannot do: **tell positions 1, 2 and 3 apart.** Role metadata has no concept of
  lane, so all three are "cores" and return identical lists. It also inherits Valve's own
  oddities — Axe and Tidehunter are tagged `Carry`, Wraith King is tagged `Support` — so
  expect occasional nonsense until real position data replaces it wholesale.

  The backtest is unaffected: it calls `predictRadiantEdge`, not `suggest`.
- **SAFE mode is validated and it FAILS.** See [SAFE-MODE.md](./SAFE-MODE.md). Held out on
  399,312 matches against 40,000 enemy lineups, `exposure` adds nothing beyond hero win rate
  (partial correlation +0.091) and a plain tier list beats it on both mean and downside.
  The construct is also inverted — high-exposure heroes have *tighter* outcome distributions,
  not worse tails — and the pick-rate weighting assumes a passive enemy, which is the
  opposite of the first-pick situation. Do not ship it as the differentiator. The one
  untested rescue is splitting the analysis by position, which needs STRATZ.
- **`w_comfort` is not implemented.** It needs a linked Steam ID.

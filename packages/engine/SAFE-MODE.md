# SAFE mode validation — result: the differentiator does not hold

**Date:** 2026-11-13
**Verdict:** as specified, `exposure` does not beat a tier list. It adds no information
beyond hero win rate, and its sign is inverted relative to its intent.

This was the project's stated edge: *"No competitor appears to model first pick this way;
they show a tier list when the board is empty. This is the differentiator."* The data does
not support it.

---

## Why this needed its own test

The P2 backtest reads the final ten heroes and predicts a winner. It exercises the counter
and synergy terms, but it can never score a **first** pick, because a historical draft
contains no counterfactual — you never observe what would have happened had the player
picked something else.

Real pick order would sidestep that. OpenDota does expose it: the `matches` table carries
`picks_bans` with explicit `order`, `is_pick` and `team`. But coverage is the same parsed
subset as everything else — **13 matches per day against 645,766** — so filling per-hero
first-pick statistics would take well over a year. Both routes to ground truth are closed.

## Design

A hero's first-pick risk is "how bad can this get once the enemy sees it", so the test
measures the **distribution** of outcomes against real enemy lineups, not the average.

- Split 2M matches on `match_id`: 80% train, 20% test.
- Build **two independent snapshots**. Strategies see only `train`. Outcomes are scored only
  with `test`. Nothing a strategy used can score itself.
- Sample 40,000 held-out Legend-bracket enemy lineups.
- For each hero, compute its expected win rate against each lineup:
  `WR(h) + sum of advantage(h, e) over the five enemies`.
- Summarise each hero by **mean** (typical game) and **p10** (bad games — the worst case
  SAFE mode claims to minimise).

**Falsification condition, fixed before running:** SAFE should lose slightly on the mean —
it is not trying to maximise it — and win on p10. If it loses on *both*, exposure is not a
useful construct.

## A bug this caught in my own metric

The first run scored outcomes as a bare sum of `advantage(h, e)` and produced a *positive*
correlation between exposure and downside, which is backwards.

The cause: `advantage(h,e) ~= -advantage(e,h) + (1 - WR_h - WR_e)`, so summing advantages
across a lineup leaves a `5 * (1 - WR_h)` term that systematically flatters weak heroes. The
metric was baseline-inverted. Including the hero's own baseline fixes it. Recorded because
the broken version looked plausible and produced confident, wrong numbers.

(Checking that also answered a separate question: `corr(advantage(i,j), advantage(j,i))` is
**-0.43**, not -1. The two directions are genuinely distinct, so `w_risk` is not redundant
with `w_counter`. That part of the design survives.)

## Results

```
correlation (Spearman) against held-out outcomes
  exposure vs downside (p10)  : -0.822
  baseline vs downside (p10)  : +0.863

the decisive comparison
  exposure vs downside, baseline held constant : +0.091   <- nothing
  baseline vs downside, exposure held constant : +0.467   <- substantial

top 10 by each strategy, scored on held-out data
                        mean WR     downside (p10 WR)
  SAFE (low exposure)    52.27%        46.30%
  tier list (meta)       52.85%        46.84%
  all candidates         49.02%        43.73%
```

Exposure correlates with downside at -0.822 in isolation, which looks like success. It is
not: hold hero strength constant and the correlation collapses to **+0.091**. The raw figure
was almost entirely "weak heroes have high exposure and bad outcomes".

The tier list beats SAFE on **both** metrics. That is the falsification condition.

## Why — the construct is inverted

```
is exposure measuring punishability rather than weakness?
  exposure vs spread (p10 - mean), baseline held constant : +0.242
```

Spread is negative, so a higher value means a *tighter* distribution. High-exposure heroes
are **less** volatile, not more. Exposure measures breadth of weakness, not depth of
punishment — and breadth of weakness is just a noisy restatement of win rate.

There is a deeper problem with the formula. It weights each counter by how often that
counter is picked:

```
exposure(h) = sum over top-N counters of  advantage(counter, h) x pickRate(counter)
```

Pick rate is a **passive-enemy** assumption. First pick is precisely the situation where the
enemy *has* information and can choose to punish you. Against an adaptive enemy the relevant
weight is how likely they are to pick a hero *because* it beats you, which is higher for a
rare hard counter — the opposite of what `pickRate` does. The formula discounts exactly the
threats that first-picking exposes you to.

A reformulation dropping pick-rate weighting entirely, using the mean of a hero's three
worst matchups, also fails:

```
  depth vs spread,   baseline held constant : +0.143   (want negative)
  depth vs downside, baseline held constant : +0.063   (want negative)
```

In this data, first-pick punishability is not separable from hero strength.

## What this test cannot rule out

The held-out lineups come from matches where the enemy did **not** know they were facing a
first pick. No public dataset contains adaptive-to-your-first-pick behaviour, so the
adaptive case is untestable here, and this result understates exposure's relevance to it.

The analysis also pools all 126 heroes regardless of role. Counter relationships are
position-dependent — a position 5 rarely lanes against the enemy position 1 — so mixing
positions may be washing out a real within-position effect. **This is the one live rescue
path**, and it needs the STRATZ position data to test.

## Recommendation

1. **Do not ship exposure as the first-pick ranking.** It is beaten by sorting on win rate.
2. For now, SAFE mode should rank on meta strength, ally synergy, and flexibility once
   position data exists — and the product should stop claiming the minimax first-pick model
   as its differentiator until there is evidence for it.
3. Re-run this harness, split by position, once STRATZ lands. The harness is
   `npm run safe-check -w @dota/worker` and takes about a minute.
4. The honest version of the pitch is the rest of the product: reactive counter suggestions
   that move with the enemy draft, surfaced confidence, and item reasoning that teaches.
   Those are validated. This one is not.

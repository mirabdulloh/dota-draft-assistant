# SPIKE-OCR — rung 1 findings

**Date:** 2026-11-13
**Question:** can we identify a Dota 2 hero from a draft-screen portrait crop, among all heroes?
**Verdict:** yes, trivially. The classifier is not the risk. **The locator is.**

---

## Setup

- Reference set: `dota_react/heroes/<slug>.png` (256×144) from Valve's CDN, all 127 heroes.
- Classifier: downscale to an N×N grid, per-channel zero-mean/unit-variance normalise,
  nearest neighbour by L2. No ML, no training, no OpenCV.
- Query: the same asset put through a degradation pipeline — rescaled to a target width,
  optionally crop-shifted (to simulate an imprecise locator), optionally blurred +
  gamma/brightness-shifted + JPEG'd at q55 (to simulate a photographed monitor).

## Results

**Resolution floor — there isn't one.** 100% top-1 accuracy at every width tested from
160px down to **16px wide**, both screenshot-clean and photo-degraded. Blur, JPEG,
gamma and brightness shifts are all non-events; the per-channel normalisation absorbs them.

**Feature config barely matters.** Every grid from 8×8 to 32×32, in both RGB and grayscale,
scored 100% on the hardest aligned case. Use **16×16 RGB** (768 floats/hero, ~390KB for the
whole reference set) — not because 8×8 failed, but because the extra headroom costs nothing
and real-world mismatch will eat some of it.

**Alignment is the only thing that breaks it:**

| Crop offset | screenshot @96px | photo-sim @96px |
|---|---|---|
| 0–6% | 100% | 100% |
| 10% | 98.4% | 99.2% |
| 15% | 74.0% | 78.0% |
| 20% | 33.9% | 42.5% |

The cliff is between 10% and 15%. **The locator must place each crop box within ~10% of the
slot's width and height.** That is the real engineering requirement coming out of rung 1.

## The expensive mistake, worth recording

First run used `dota_react/heroes/crops/<slug>.png` (400×250) as the reference set, assuming
it was a re-framing of the same artwork. It is not — it is a full-body marketing render on a
white background, while `heroes/<slug>.png` is the dark in-game bust. Accuracy was **1.6%**
against a 0.8% random baseline.

The lesson is not "I picked the wrong file". It is that **this classifier degrades to random,
not to mediocre, when the reference art doesn't match the rendered art.** There is no partial
credit and no warning sign in the score distribution. Asset selection has to be verified
against real game output, not assumed.

## What rung 1 does NOT establish

Everything above is same-asset matching: the query is a degraded copy of the reference. It
proves the method is sound and bounds the resolution and alignment requirements. It does
**not** prove the in-game draft screen renders this same artwork. Given the failure mode
above, that assumption was the single highest-value thing left to check.

---

# Rung 2 — against a real draft screen

**Verdict: the core assumption holds. 9/9 filled slots correct, first try, no tuning.**

Ground truth: a real 3840×2160 Ranked All Pick draft screenshot
(`interfaceingame.com`, archived game-UI screenshot).

## The read target is the top bar, not a side panel

Allies occupy five slots at the top left, enemies five at the top right, with the pick timer
between them. Each portrait is ~240×135 at 4K — **aspect 1.78, the same as the CDN asset's
256×144.** Geometry is stored as fractions of screen width/height in `src/read-draft.ts`.

## Result

| Slot | Classified | Margin |
|---|---|---|
| ally 0 | juggernaut | 0.459 |
| ally 1 | bristleback | 0.484 |
| ally 2 | windrunner | 0.607 |
| ally 3 | sniper | 0.383 |
| ally 4 | *(empty slot)* | **0.995** |
| enemy 0 | templar_assassin | 0.480 |
| enemy 1 | slark | 0.426 |
| enemy 2 | silencer | 0.606 |
| enemy 3 | vengefulspirit | 0.545 |
| enemy 4 | pangolier | 0.523 |

All nine filled slots verified correct by eye against the contact sheet.

**The margin metric separates cleanly.** Real heroes land at 0.38–0.61; the one unpicked slot
lands at 0.995. Empty-slot detection needs no extra logic — a threshold around 0.85 gets it
for free, and the same number drives the "confirm this hero?" prompt in the UI.

## Resolution

Same fractional geometry, the screenshot downscaled:

| Width | Result |
|---|---|
| 3840 | 9/9, empty slot flagged |
| 2560 | 9/9, empty slot flagged |
| 1920 | 9/9, empty slot flagged |
| 1600 | 9/9, empty slot flagged |
| 1366 | 9/9, empty slot flagged |
| 1280 | 9/9, empty slot flagged |

Margins barely move across the range, consistent with rung 1's finding that resolution is a
non-issue well below these sizes.

## Still open

- **One screenshot, one layout.** Nine heroes out of 127 references tested.
- **Downscaling is not the same as a native lower resolution.** Dota's UI may *reflow* rather
  than scale — slot positions could shift at a different aspect ratio or UI-scale setting.
  Native screenshots at 1920×1080 and a non-16:9 aspect would settle it.
- **Captains Mode is untested** and likely has different geometry.
- **The bans row is unread.** Worth capturing: a banned hero is one you cannot suggest.
- The source screenshot is from an older client build; the top-bar layout has been stable for
  years, but this should be re-checked against a current screenshot.

## Next

1. Confirm geometry against a native non-4K screenshot and a 21:9 one if available.
2. Read the ban row.
3. Photo-of-monitor path (rung 3) now needs only a locator that survives perspective — the
   classifier itself is already proven well past what photos will demand.

## Reproducing

```bash
cd spikes/ocr && npm install && npm run portraits && npm run bench
node src/read-draft.ts <screenshot> tiles.png
```

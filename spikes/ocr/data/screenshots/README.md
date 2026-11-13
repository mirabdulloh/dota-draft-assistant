# Draft screenshots — what to capture

Drop files straight in this folder. Any filename is fine; if the name happens to list the
heroes (`radiant_lina_cm_axe.png`) that saves me transcribing ground truth, but don't bother
renaming — I can read them off the image.

## What matters, roughly in order

1. **Full frame, uncropped.** I need to work out slot geometry as a fraction of the screen,
   so I need the whole screen including the edges. Don't crop to the draft panel.

2. **PNG, not JPEG.** Windows `Win+Shift+S` or Print Screen gives PNG. Steam's F12 writes
   JPEG — usable, but it adds compression we didn't intend to measure.

3. **Spread the heroes out.** 20 screenshots showing the same 10 heroes tests 10 references.
   20 showing 60 different heroes tests 60. Different games > different moments of one game.

4. **Mixed resolution / UI scale**, if you can. Dota scales its UI, so the portrait slots are
   a different pixel size at 1080p vs 1440p vs 4K, and the whole point of rung 2 is finding
   where the slot boxes sit relative to resolution. Even 3-4 at a second resolution helps.
   If you ever change the in-game UI scale slider, one shot at a different setting is gold.

5. **Both partial and complete drafts.** A couple with only 2-3 heroes picked, a couple with
   all 10. Empty slots may render differently from filled ones, and the app has to handle both.

6. **Both sides.** Some where you're Radiant, some Dire — the panels mirror.

7. **The mode you actually play.** Ranked All Pick is the target. If you also play Captains
   Mode, 2-3 of those tells me whether the layout differs enough to need separate geometry.

## What I'm checking with them

- Does the in-game draft screen draw the same artwork as the CDN reference portraits? This is
  the one assumption rung 1 could not test, and the failure mode is total rather than gradual
  (see `../../FINDINGS.md`), so it has to be verified rather than assumed.
- Where are the ten slot boxes, as a fraction of screen width/height?
- Can a fixed geometry handle every resolution, or does the layout reflow?

Five or six good varied screenshots are enough to answer all three. Twenty makes the accuracy
number trustworthy. Don't let the count block you — send what you have and I'll start.

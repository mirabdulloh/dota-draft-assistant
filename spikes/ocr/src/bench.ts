import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { heroList } from './heroes.ts';
import { features, classify, type FeatureKind, type Reference } from './classifier.ts';
import { degrade, type Conditions } from './degrade.ts';

const PORTRAITS = new URL('../data/portraits/', import.meta.url).pathname;
const CONCURRENCY = 8;
const REF_VARIANT = 'landscape';

const list = heroList();

function path(id: number, slug: string) {
  return join(PORTRAITS, REF_VARIANT, `${id}_${slug}.png`);
}

async function mapLimit<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function buildRefs(grid: number, kind: FeatureKind): Promise<Reference[]> {
  return mapLimit(list, async (h) => ({
    id: h.id,
    slug: h.slug,
    vec: await features(await readFile(path(h.id, h.slug)), { grid, kind }),
  }));
}

type Result = { accuracy: number; ambiguous: number; misses: string[] };

async function evaluate(
  refs: Reference[],
  cond: Conditions,
  grid: number,
  kind: FeatureKind,
): Promise<Result> {
  const fn = degrade(cond);
  const outcomes = await mapLimit(list, async (h) => {
    const vec = await features(await fn(await readFile(path(h.id, h.slug))), { grid, kind });
    const match = classify(vec, refs);
    return { hero: h, match, hit: match.id === h.id };
  });
  return {
    accuracy: outcomes.filter((o) => o.hit).length / outcomes.length,
    ambiguous: outcomes.filter((o) => o.match.margin > 0.95).length,
    misses: outcomes.filter((o) => !o.hit).map((o) => `${o.hero.slug} -> ${o.match.slug}`),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  console.log(`SPIKE-OCR rung 1 — ${list.length} heroes, ref = dota_react/heroes (256x144)\n`);

  // Phase 1: choose the feature config on a deliberately hard case —
  // photographed monitor, 56px wide, locator off by 6%.
  const hard: Conditions = { width: 56, offset: 0.06, photo: true };
  console.log('PHASE 1  feature config  (56px, 6% offset, photo-sim)');
  console.log('grid  kind   accuracy');
  let best = { grid: 16, kind: 'rgb' as FeatureKind, accuracy: -1 };
  for (const kind of ['rgb', 'gray'] as FeatureKind[]) {
    for (const grid of [8, 12, 16, 24, 32]) {
      const refs = await buildRefs(grid, kind);
      const r = await evaluate(refs, hard, grid, kind);
      console.log(`${String(grid).padStart(4)}  ${kind.padEnd(5)}  ${pct(r.accuracy)}`);
      if (r.accuracy > best.accuracy) best = { grid, kind, accuracy: r.accuracy };
    }
  }
  const { grid, kind } = best;
  console.log(`\n-> grid=${grid} kind=${kind}\n`);
  const refs = await buildRefs(grid, kind);

  // Phase 2: resolution floor, perfectly aligned.
  console.log('PHASE 2  resolution floor (aligned)');
  console.log('width   screenshot   photo-sim');
  for (const width of [160, 120, 96, 72, 56, 40, 32, 24, 16]) {
    const s = await evaluate(refs, { width }, grid, kind);
    const p = await evaluate(refs, { width, photo: true }, grid, kind);
    console.log(`${String(width).padStart(5)}   ${pct(s.accuracy).padStart(10)}   ${pct(p.accuracy).padStart(9)}`);
  }

  // Phase 3: how precise does the locator have to be?
  console.log('\nPHASE 3  locator alignment tolerance');
  console.log('offset   screenshot@96   photo@96');
  for (const offset of [0, 0.02, 0.04, 0.06, 0.1, 0.15, 0.2]) {
    const s = await evaluate(refs, { width: 96, offset }, grid, kind);
    const p = await evaluate(refs, { width: 96, offset, photo: true }, grid, kind);
    console.log(
      `${(offset * 100).toFixed(0).padStart(5)}%   ${pct(s.accuracy).padStart(13)}   ${pct(p.accuracy).padStart(8)}`,
    );
  }

  // Phase 4: the realistic operating point, with the actual failures named.
  const op: Conditions = { width: 96, offset: 0.04, photo: true };
  console.log('\nPHASE 4  operating point: 96px, 4% offset, photo-sim');
  const detail = await evaluate(refs, op, grid, kind);
  console.log(`accuracy ${pct(detail.accuracy)}  (${detail.misses.length} misses, ${detail.ambiguous} ambiguous)`);
  for (const m of detail.misses) console.log(`  MISS ${m}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

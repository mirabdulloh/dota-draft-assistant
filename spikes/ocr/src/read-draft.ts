import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { heroList } from './heroes.ts';
import { features, classify, type Reference } from './classifier.ts';

const PORTRAITS = new URL('../data/portraits/landscape/', import.meta.url).pathname;
const GRID = 16;
const KIND = 'rgb' as const;

/**
 * Top-bar slot geometry, as fractions of screen width/height. Measured off a
 * 3840x2160 All Pick draft screen. Fractions rather than pixels so the same
 * numbers can be tried against other resolutions.
 */
export const TOPBAR = {
  y: 13 / 2160,
  h: 135 / 2160,
  w: 240 / 3840,
  pitch: 247 / 3840,
  allyX: 419 / 3840,
  enemyX: 2189 / 3840,
};

export function slotBoxes(width: number, height: number) {
  const w = Math.round(TOPBAR.w * width);
  const h = Math.round(TOPBAR.h * height);
  const top = Math.round(TOPBAR.y * height);
  const pitch = TOPBAR.pitch * width;
  const boxes: { team: 'ally' | 'enemy'; i: number; left: number; top: number; width: number; height: number }[] = [];
  for (const [team, startFrac] of [
    ['ally', TOPBAR.allyX],
    ['enemy', TOPBAR.enemyX],
  ] as const) {
    for (let i = 0; i < 5; i++) {
      boxes.push({
        team,
        i,
        left: Math.round(startFrac * width + i * pitch),
        top,
        width: w,
        height: h,
      });
    }
  }
  return boxes;
}

async function buildRefs(): Promise<Reference[]> {
  const list = heroList();
  return Promise.all(
    list.map(async (h) => ({
      id: h.id,
      slug: h.slug,
      vec: await features(await readFile(join(PORTRAITS, `${h.id}_${h.slug}.png`)), {
        grid: GRID,
        kind: KIND,
      }),
    })),
  );
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: node src/read-draft.ts <screenshot>');

  const img = sharp(file);
  const meta = await img.metadata();
  const W = meta.width!;
  const H = meta.height!;
  console.log(`${file}  ${W}x${H}\n`);

  const refs = await buildRefs();
  const boxes = slotBoxes(W, H);
  const tiles: Buffer[] = [];

  for (const b of boxes) {
    const crop = await sharp(file)
      .extract({ left: b.left, top: b.top, width: b.width, height: b.height })
      .png()
      .toBuffer();
    tiles.push(crop);
    const match = classify(await features(crop, { grid: GRID, kind: KIND }), refs);
    const conf = match.margin < 0.75 ? 'strong' : match.margin < 0.9 ? 'ok' : 'WEAK';
    console.log(
      `${b.team.padEnd(5)} ${b.i}  ${match.slug.padEnd(22)} margin ${match.margin.toFixed(3)}  ${conf}`,
    );
  }

  // Contact sheet so the crops can be eyeballed against the classifier's answers.
  const tileW = boxes[0].width;
  const tileH = boxes[0].height;
  const sheet = await sharp({
    create: { width: tileW * 5, height: tileH * 2, channels: 3, background: '#000' },
  })
    .composite(
      tiles.map((input, i) => ({
        input,
        left: (i % 5) * tileW,
        top: Math.floor(i / 5) * tileH,
      })),
    )
    .png()
    .toBuffer();
  const out = process.argv[3] ?? 'tiles.png';
  await writeFile(out, sheet);
  console.log(`\ncontact sheet -> ${out}  (row 1 = ally, row 2 = enemy)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

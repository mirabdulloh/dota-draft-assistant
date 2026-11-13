import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { heroes } from 'dotaconstants';
import { serialiseSnapshot, deserialiseSnapshot } from '@dota/engine';
import type { Db } from './db.ts';
import { loadSnapshot } from './load-snapshot.ts';
import { buildItemData } from './item-data.ts';

const BRACKETS = [1, 2, 3, 4, 5, 6, 7];
const BRACKET_NAME = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine'];

/**
 * Writes what the app scores against offline.
 *
 * Hero names and item data are the same whatever bracket you play, so they go
 * in one shared file rather than being duplicated seven times. Each bracket
 * then ships only its own matrices.
 */
export async function exportSnapshot(
  db: Db,
  opts: { patch: string; outDir: string; refreshItems: boolean },
): Promise<void> {
  await mkdir(opts.outDir, { recursive: true });

  const meta = Object.values(
    heroes as Record<string, { id: number; localized_name: string; img: string }>,
  )
    .map((h) => ({
      id: h.id,
      name: h.localized_name,
      slug: h.img.split('?')[0].split('/').pop()!.replace(/\.png$/, ''),
    }))
    .sort((a, b) => a.id - b.id);

  const itemData = await buildItemData(opts.refreshItems);
  const sharedJson = JSON.stringify({ version: 1, heroes: meta, items: itemData });
  await writeFile(join(opts.outDir, 'shared.json'), sharedJson);

  const withCore = Object.values(itemData.core).filter((c) => c.length > 0).length;
  console.log(
    `shared.json  ${(sharedJson.length / 1024).toFixed(0)} KB  ` +
      `(${meta.length} heroes, ${withCore} core builds, ${itemData.rules.length} item rules)`,
  );
  console.log('\nbracket      matches     size');

  let total = sharedJson.length;
  for (const bracket of BRACKETS) {
    const snapshot = await loadSnapshot(db, { bracket, patch: opts.patch });
    const payload = serialiseSnapshot(snapshot);

    // A snapshot that fails to decode surfaces on the phone mid-draft rather
    // than here, so every value is checked before it is written.
    const back = deserialiseSnapshot(payload);
    for (const key of ['baseline', 'pickRate', 'advantage', 'synergy'] as const) {
      const a = snapshot[key];
      const b = back[key];
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) throw new Error(`bracket ${bracket} ${key}: mismatch at ${i}`);
      }
    }

    const json = JSON.stringify(payload);
    await writeFile(join(opts.outDir, `snapshot-${bracket}.json`), json);
    total += json.length;
    console.log(
      `  ${BRACKET_NAME[bracket].padEnd(10)} ${snapshot.matchesUsed.toLocaleString().padStart(9)}` +
        `  ${(json.length / 1024).toFixed(0).padStart(5)} KB`,
    );
  }

  console.log(`\nall seven brackets round-trip verified · ${(total / 1024 / 1024).toFixed(2)} MB total`);
}

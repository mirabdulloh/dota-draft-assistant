import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { heroes } from 'dotaconstants';
import { serialiseSnapshot, deserialiseSnapshot } from '@dota/engine';
import type { Db } from './db.ts';
import { loadSnapshot } from './load-snapshot.ts';

/**
 * Writes the blob the app downloads and scores against offline. Round-trips it
 * before writing: a snapshot that fails to decode is worse than no snapshot,
 * because the failure surfaces on the phone mid-draft rather than here.
 */
export async function exportSnapshot(
  db: Db,
  opts: { bracket: number; patch: string; out: string },
): Promise<void> {
  const snapshot = await loadSnapshot(db, { bracket: opts.bracket, patch: opts.patch });
  // Hero names and portrait slugs travel with the snapshot so the app needs no
  // copy of dotaconstants, which is megabytes the phone would never read.
  const meta = Object.values(heroes as Record<string, { id: number; localized_name: string; img: string }>)
    .map((h) => ({
      id: h.id,
      name: h.localized_name,
      slug: h.img.split('?')[0].split('/').pop()!.replace(/\.png$/, ''),
    }))
    .sort((a, b) => a.id - b.id);

  const payload = { ...serialiseSnapshot(snapshot), heroes: meta };
  const json = JSON.stringify(payload);

  const back = deserialiseSnapshot(payload);
  const n = snapshot.heroIds.length;
  for (const key of ['baseline', 'pickRate', 'advantage', 'synergy'] as const) {
    const a = snapshot[key];
    const b = back[key];
    if (a.length !== b.length) throw new Error(`${key}: length ${a.length} -> ${b.length}`);
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) throw new Error(`${key}: mismatch at ${i} (${a[i]} vs ${b[i]})`);
    }
  }

  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, json);

  const kb = (json.length / 1024).toFixed(0);
  console.log(`patch ${snapshot.patch}  bracket ${snapshot.bracket}  ${n} heroes`);
  console.log(`built from ${snapshot.matchesUsed.toLocaleString()} matches`);
  console.log(`round-trip verified, every value identical`);
  console.log(`wrote ${opts.out}  (${kb} KB, ${meta.length} heroes with names)`);
}

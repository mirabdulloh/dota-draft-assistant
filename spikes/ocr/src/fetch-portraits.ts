import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { heroList, variants, type VariantName } from './heroes.ts';

const OUT = new URL('../data/portraits/', import.meta.url).pathname;
const CONCURRENCY = 8;

async function fetchWithRetry(url: string, attempts = 3): Promise<Buffer> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw new Error(`failed ${url}: ${lastErr}`);
}

async function run() {
  const list = heroList();
  const names = Object.keys(variants) as VariantName[];
  console.log(`${list.length} heroes x ${names.length} variants`);

  for (const variant of names) {
    const dir = join(OUT, variant);
    await mkdir(dir, { recursive: true });

    let done = 0;
    let skipped = 0;
    const failures: string[] = [];
    const queue = [...list];

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const hero = queue.shift();
        if (!hero) return;
        const dest = join(dir, `${hero.id}_${hero.slug}.png`);
        try {
          await stat(dest);
          skipped++;
          continue;
        } catch {
          // not cached yet
        }
        try {
          const buf = await fetchWithRetry(variants[variant](hero.slug));
          await writeFile(dest, buf);
          done++;
        } catch (err) {
          failures.push(`${hero.id} ${hero.slug}: ${(err as Error).message}`);
        }
      }
    });
    await Promise.all(workers);

    console.log(`\n[${variant}] downloaded ${done}, cached ${skipped}, failed ${failures.length}`);
    for (const f of failures) console.log(`  FAIL ${f}`);

    const sample = join(dir, `${list[0].id}_${list[0].slug}.png`);
    const meta = await sharp(sample).metadata();
    console.log(`[${variant}] dimensions: ${meta.width}x${meta.height} ${meta.format}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

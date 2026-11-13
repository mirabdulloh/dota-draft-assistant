import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { heroes, items } from 'dotaconstants';
import type { ItemData, ItemRef } from '@dota/engine';
import { fetchCoreBuilds, type CoreItem } from './item-builds.ts';
import { HERO_THREATS } from './hero-threats.ts';
import { ITEM_RULES, SKIP_RULES } from './item-rules.ts';

const CACHE = new URL('../.data/core-builds.json', import.meta.url).pathname;

const slugOf = (img: string) => img.split('?')[0].split('/').pop()!.replace(/\.png$/, '');

/** Core builds come from 127 API calls, so they are cached between exports. */
async function coreBuilds(refresh: boolean): Promise<Record<number, CoreItem[]>> {
  if (!refresh) {
    try {
      return JSON.parse(await readFile(CACHE, 'utf8'));
    } catch {
      // no cache yet
    }
  }
  const built = await fetchCoreBuilds((done, total) => {
    process.stdout.write(`\r  core builds ${done}/${total}`);
  });
  process.stdout.write('\n');
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(built));
  return built;
}

export function itemRef(key: string): ItemRef {
  const it = (items as Record<string, { dname?: string; cost?: number }>)[key];
  return { key, name: it?.dname ?? key, cost: it?.cost ?? 0 };
}

export async function buildItemData(refresh: boolean): Promise<ItemData> {
  const core = await coreBuilds(refresh);

  const threats: ItemData['threats'] = {};
  for (const h of Object.values(heroes as Record<string, { id: number; img: string }>)) {
    const profile = HERO_THREATS[slugOf(h.img)];
    if (profile) threats[h.id] = profile;
  }

  const trimmed: ItemData['core'] = {};
  for (const [id, list] of Object.entries(core)) {
    trimmed[Number(id)] = list.map((c) => ({ key: c.key, name: c.name, cost: c.cost }));
  }

  const names: ItemData['names'] = {};
  for (const list of Object.values(trimmed)) for (const i of list) names[i.key] = i;
  for (const r of [...ITEM_RULES, ...SKIP_RULES]) names[r.item] ??= itemRef(r.item);

  return { core: trimmed, threats, rules: ITEM_RULES, skipRules: SKIP_RULES, names };
}

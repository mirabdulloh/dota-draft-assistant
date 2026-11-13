import { heroes, item_ids, items } from 'dotaconstants';

export type CoreItem = { key: string; name: string; cost: number; picks: number };

/**
 * Items that appear in another item's recipe. OpenDota's popularity counts log
 * every component purchase, so Mithril Hammer and Broadsword outrank Battle
 * Fury on a Phantom Assassin unless these are stripped out.
 */
function componentKeys(): Set<string> {
  const set = new Set<string>();
  for (const it of Object.values(items as Record<string, { components?: string[] | null }>)) {
    for (const c of it.components ?? []) set.add(c);
  }
  return set;
}

/** Boots and consumables are universal, so they teach the player nothing. */
const MIN_COST = 1800;
const EXCLUDE = new Set(['travel_boots', 'travel_boots_2', 'boots', 'power_treads', 'phase_boots', 'arcane_boots', 'tranquil_boots', 'guardian_greaves']);

const CORE_PER_HERO = 6;
const REQUEST_GAP_MS = 1100;

export async function fetchCoreBuilds(
  onProgress?: (done: number, total: number) => void,
): Promise<Record<number, CoreItem[]>> {
  const components = componentKeys();
  const ids = Object.values(heroes as Record<string, { id: number }>).map((h) => h.id).sort((a, b) => a - b);
  const out: Record<number, CoreItem[]> = {};

  for (const [i, heroId] of ids.entries()) {
    const res = await fetch(`https://api.opendota.com/api/heroes/${heroId}/itemPopularity`);
    if (res.ok) {
      const d = (await res.json()) as Record<string, Record<string, number>>;
      const merged = new Map<string, number>();
      for (const phase of ['mid_game_items', 'late_game_items']) {
        for (const [id, n] of Object.entries(d[phase] ?? {})) {
          const key = (item_ids as Record<string, string>)[id];
          if (!key) continue;
          merged.set(key, (merged.get(key) ?? 0) + n);
        }
      }
      out[heroId] = [...merged]
        .map(([key, picks]) => {
          const it = (items as Record<string, { dname?: string; cost?: number }>)[key];
          return { key, name: it?.dname ?? key, cost: it?.cost ?? 0, picks };
        })
        .filter((r) => r.cost >= MIN_COST && !components.has(r.key) && !EXCLUDE.has(r.key))
        .sort((a, b) => b.picks - a.picks)
        .slice(0, CORE_PER_HERO);
    } else {
      out[heroId] = [];
    }
    onProgress?.(i + 1, ids.length);
    await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
  }
  return out;
}

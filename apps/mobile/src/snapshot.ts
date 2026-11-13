import {
  createEngine,
  deserialiseSnapshot,
  type Engine,
  type ItemData,
  type ItemRef,
  type SerialisedSnapshot,
} from '@dota/engine';
import shared from '../assets/shared.json';
import b1 from '../assets/snapshot-1.json';
import b2 from '../assets/snapshot-2.json';
import b3 from '../assets/snapshot-3.json';
import b4 from '../assets/snapshot-4.json';
import b5 from '../assets/snapshot-5.json';
import b6 from '../assets/snapshot-6.json';
import b7 from '../assets/snapshot-7.json';

export type HeroMeta = { id: number; name: string; slug: string };

const sharedData = shared as unknown as { heroes: HeroMeta[]; items: ItemData };

export const heroes: HeroMeta[] = sharedData.heroes;
export const heroById = new Map<number, HeroMeta>(heroes.map((h) => [h.id, h]));
export const heroName = (id: number) => heroById.get(id)?.name ?? `#${id}`;

export const itemData: ItemData = sharedData.items;
export const itemRef = (key: string): ItemRef =>
  itemData.names[key] ?? { key, name: key.replace(/_/g, ' '), cost: 0 };

export const itemIconUrl = (key: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${key}.png`;

export const BRACKET_NAME = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine'];
export const BRACKETS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Bracket = (typeof BRACKETS)[number];

const RAW: Record<number, unknown> = { 1: b1, 2: b2, 3: b3, 4: b4, 5: b5, 6: b6, 7: b7 };

/**
 * Decoded on first use and kept. The base64 payloads sit idle until a bracket
 * is actually opened, so switching costs one decode and no network call —
 * which is the whole reason the snapshot ships with the app.
 */
const engines = new Map<number, Engine>();
const infos = new Map<number, { patch: string; bracket: number; matches: number }>();

export function engineFor(bracket: Bracket): Engine {
  const cached = engines.get(bracket);
  if (cached) return cached;
  const snapshot = deserialiseSnapshot(RAW[bracket] as SerialisedSnapshot);
  const engine = createEngine(snapshot, { heroName });
  engines.set(bracket, engine);
  infos.set(bracket, {
    patch: snapshot.patch,
    bracket: snapshot.bracket,
    matches: snapshot.matchesUsed,
  });
  return engine;
}

export function snapshotInfoFor(bracket: Bracket) {
  engineFor(bracket);
  return infos.get(bracket)!;
}

import {
  createEngine,
  deserialiseSnapshot,
  type Engine,
  type ItemData,
  type ItemRef,
  type SerialisedSnapshot,
} from '@dota/engine';
import raw from '../assets/snapshot.json';

export type HeroMeta = { id: number; name: string; slug: string };

type Payload = SerialisedSnapshot & { heroes: HeroMeta[]; items: ItemData };

/**
 * Decoded once at module load. The whole point of the snapshot is that nothing
 * touches the network during a draft, so this is deliberately synchronous and
 * bundled rather than fetched.
 */
const payload = raw as unknown as Payload;
const snapshot = deserialiseSnapshot(payload);

export const heroes: HeroMeta[] = payload.heroes;
export const heroById = new Map<number, HeroMeta>(heroes.map((h) => [h.id, h]));
export const heroName = (id: number) => heroById.get(id)?.name ?? `#${id}`;

export const engine: Engine = createEngine(snapshot, { heroName });

export const itemData: ItemData = payload.items;

export const itemRef = (key: string): ItemRef =>
  itemData.names[key] ?? { key, name: key.replace(/_/g, ' '), cost: 0 };

export const itemIconUrl = (key: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${key}.png`;

export const snapshotInfo = {
  patch: snapshot.patch,
  bracket: snapshot.bracket,
  builtAt: snapshot.builtAt,
  matches: snapshot.matchesUsed,
};

export const BRACKET_NAME = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine'];

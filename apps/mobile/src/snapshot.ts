import {
  createEngine,
  deserialiseSnapshot,
  type Engine,
  type SerialisedSnapshot,
} from '@dota/engine';
import raw from '../assets/snapshot.json';

export type HeroMeta = { id: number; name: string; slug: string };

type Payload = SerialisedSnapshot & { heroes: HeroMeta[] };

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

export const snapshotInfo = {
  patch: snapshot.patch,
  bracket: snapshot.bracket,
  builtAt: snapshot.builtAt,
  matches: snapshot.matchesUsed,
};

export const BRACKET_NAME = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine'];

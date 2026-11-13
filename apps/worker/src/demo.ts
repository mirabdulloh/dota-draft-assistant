import { heroes } from 'dotaconstants';
import { createEngine, type DraftState, type PickOrder } from '@dota/engine';
import type { Db } from './db.ts';
import { loadSnapshot } from './load-snapshot.ts';

const NAME = new Map<number, string>(
  Object.values(heroes as Record<string, { id: number; localized_name: string }>).map((h) => [
    h.id,
    h.localized_name,
  ]),
);
const byName = (s: string) => {
  for (const [id, n] of NAME) if (n.toLowerCase() === s.toLowerCase()) return id;
  throw new Error(`unknown hero: ${s}`);
};

export async function demo(db: Db, opts: { bracket: number; patch: string }): Promise<void> {
  const snapshot = await loadSnapshot(db, opts);
  const engine = createEngine(snapshot, { heroName: (id) => NAME.get(id) ?? `#${id}` });

  const t0 = performance.now();

  const scenarios: { label: string; draft: DraftState }[] = [
    {
      label: 'FIRST PICK — nothing on the board',
      draft: { myPosition: 5, pickOrder: 'first', enemies: [], allies: [], banned: [] },
    },
    {
      label: 'LAST PICK — pos 1 against a visible enemy draft',
      draft: {
        myPosition: 1,
        pickOrder: 'last',
        enemies: ['Lina', 'Lion', 'Axe', 'Zeus', 'Tidehunter'].map(byName),
        allies: ['Crystal Maiden', 'Mirana', 'Pudge', 'Invoker'].map(byName),
        banned: [],
      },
    },
    {
      label: 'LAST PICK — same slot, enemy carries instead',
      draft: {
        myPosition: 1,
        pickOrder: 'last',
        enemies: ['Spectre', 'Phantom Lancer', 'Medusa', 'Terrorblade', 'Naga Siren'].map(byName),
        allies: ['Crystal Maiden', 'Mirana', 'Pudge', 'Invoker'].map(byName),
        banned: [],
      },
    },
  ];

  for (const { label, draft } of scenarios) {
    const started = performance.now();
    const result = engine.suggest(draft, 5);
    const ms = performance.now() - started;

    console.log(`\n${label}`);
    console.log(`  mode ${result.mode}   scored in ${ms.toFixed(2)}ms`);
    if (result.missing.length) console.log(`  missing: ${result.missing.join(', ')}`);
    for (const [n, p] of result.picks.entries()) {
      const dots = '*'.repeat(Math.round(p.confidence * 5)).padEnd(5, '.');
      console.log(
        `   ${n + 1}. ${(NAME.get(p.heroId) ?? '?').padEnd(18)} ${p.score >= 0 ? '+' : ''}${(p.score * 100).toFixed(2).padStart(6)}  ${dots}  ${p.reason}`,
      );
    }
    const worst = result.avoid[0];
    if (worst) console.log(`   avoid: ${NAME.get(worst.heroId)} — ${worst.reason}`);
  }

  console.log(`\ntotal ${(performance.now() - t0).toFixed(0)}ms including snapshot load`);
}

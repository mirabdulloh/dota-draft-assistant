import { heroes } from 'dotaconstants';
import { heroIndex } from './hero-index.ts';

/**
 * Valve's `roles` array mapped onto positions 1-5.
 *
 * This is deliberately permissive. The mapping is noisy — Axe and Tidehunter
 * are both tagged `Carry` — so it errs toward letting heroes through: a false
 * positive merely enters the candidate pool and gets ranked down by advantage
 * and meta, while a false negative hides a hero from the user entirely.
 *
 * It gates candidates and contributes nothing to the score. Real per-position
 * win rates replace it outright; see `spikes/data/FINDINGS.md` for why they
 * cannot come from OpenDota.
 */
const POSITION_ROLES: Record<number, string[]> = {
  1: ['Carry'],
  2: ['Carry', 'Nuker'],
  3: ['Durable', 'Initiator', 'Carry'],
  4: ['Support', 'Initiator'],
  5: ['Support'],
};

/**
 * A hero reaches position 4 either by being a support outright, or by being a
 * non-carry initiator (Pudge, Tusk). Without this, anything tagged both Carry
 * and Initiator — Sven, Lifestealer — is offered as a soft support.
 */
function eligibleForPosition(position: number, roles: string[]): boolean {
  if (position === 4 && !roles.includes('Support')) {
    return roles.includes('Initiator') && !roles.includes('Carry');
  }
  return POSITION_ROLES[position].some((r) => roles.includes(r));
}

export function buildPositionEligibility(): Uint8Array {
  const ids = heroIndex();
  const byId = new Map<number, string[]>(
    Object.values(heroes as Record<string, { id: number; roles: string[] }>).map((h) => [
      h.id,
      h.roles,
    ]),
  );

  const mask = new Uint8Array(ids.length * 5);
  ids.forEach((id, i) => {
    const roles = byId.get(id) ?? [];
    for (let p = 1; p <= 5; p++) {
      const allowed = eligibleForPosition(p, roles);
      // A hero Valve tags with nothing useful stays eligible everywhere rather
      // than vanishing from the app.
      mask[i * 5 + (p - 1)] = allowed || roles.length === 0 ? 1 : 0;
    }
  });
  return mask;
}

import { heroes } from 'dotaconstants';
import { heroIndex } from './hero-index.ts';
import { HERO_POSITIONS } from './hero-positions.ts';

/**
 * Fallback only, for heroes missing from HERO_POSITIONS. Valve's `roles` cannot
 * really gate positions — `Nuker` is on 89 of 127 heroes — so this is a loose
 * net to keep a new hero visible rather than vanishing, not a real classifier.
 */
const FALLBACK_ROLES: Record<number, string[]> = {
  1: ['Carry'],
  2: ['Carry', 'Nuker'],
  3: ['Durable', 'Initiator', 'Carry'],
  4: ['Support', 'Initiator'],
  5: ['Support'],
};

function fallbackEligible(position: number, roles: string[]): boolean {
  if (position === 4 && !roles.includes('Support')) {
    return roles.includes('Initiator') && !roles.includes('Carry');
  }
  return FALLBACK_ROLES[position].some((r) => roles.includes(r));
}

function slugOf(img: string): string {
  return img.split('?')[0].split('/').pop()!.replace(/\.png$/, '');
}

export type Coverage = { curated: string[]; fallback: string[] };

export function positionCoverage(): Coverage {
  const curated: string[] = [];
  const fallback: string[] = [];
  for (const h of Object.values(heroes as Record<string, { img: string; localized_name: string }>)) {
    (HERO_POSITIONS[slugOf(h.img)] ? curated : fallback).push(h.localized_name);
  }
  return { curated: curated.sort(), fallback: fallback.sort() };
}

export function buildPositionEligibility(): Uint8Array {
  const ids = heroIndex();
  const byId = new Map<number, { roles: string[]; slug: string }>(
    Object.values(heroes as Record<string, { id: number; roles: string[]; img: string }>).map(
      (h) => [h.id, { roles: h.roles, slug: slugOf(h.img) }],
    ),
  );

  const mask = new Uint8Array(ids.length * 5);
  ids.forEach((id, i) => {
    const entry = byId.get(id);
    const curated = entry ? HERO_POSITIONS[entry.slug] : undefined;
    for (let p = 1; p <= 5; p++) {
      const allowed = curated
        ? curated.includes(p)
        : fallbackEligible(p, entry?.roles ?? []) || !entry?.roles.length;
      mask[i * 5 + (p - 1)] = allowed ? 1 : 0;
    }
  });
  return mask;
}

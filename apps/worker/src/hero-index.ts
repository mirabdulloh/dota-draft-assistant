import { heroes } from 'dotaconstants';

/**
 * Hero index order comes from dotaconstants, not from whatever happens to
 * appear in the data, so indices stay stable between snapshots and a phone
 * holding an older snapshot cannot silently misread a newer one.
 */
export function heroIndex(): number[] {
  return Object.values(heroes as Record<string, { id: number }>)
    .map((h) => h.id)
    .sort((a, b) => a - b);
}

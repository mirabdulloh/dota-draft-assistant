export type ThreatTag =
  | 'magic_burst'
  | 'physical_carry'
  | 'single_target_disable'
  | 'heavy_healing'
  | 'evasion'
  | 'strong_passive'
  | 'invisibility'
  | 'illusions_summons'
  | 'blink_initiator'
  | 'buff_dependent'
  | 'physical_immunity'
  | 'silence';

export type ThreatProfile = Partial<Record<ThreatTag, number>>;

export type ItemRule = { item: string; counters: ThreatTag; weight: number; reason: string };
export type SkipRule = { item: string; weakenedBy: ThreatTag; reason: string };

export type ItemRef = { key: string; name: string; cost: number };

export type ItemData = {
  /** Statistical core build per hero id — Layer 1, what winners actually buy. */
  core: Record<number, ItemRef[]>;
  /** Layer 2, human-approved. */
  threats: Record<number, ThreatProfile>;
  rules: ItemRule[];
  skipRules: SkipRule[];
  /** Display name and cost for every item the rules or core builds reference. */
  names: Record<string, ItemRef>;
};

export type Threat = { tag: ThreatTag; total: number; enemies: number[] };

export type Recommendation = {
  key: string;
  name: string;
  cost: number;
  reason: string;
  enemies: number[];
};

export type ItemBuild = {
  core: ItemRef[];
  because: Recommendation[];
  skip: Recommendation[];
  threats: Threat[];
};

/** A tag has to reach this before it is worth an item slot. */
const TAG_THRESHOLD = 0.5;
/** Minimum strength for an enemy to be named as the cause. */
const BLAME_THRESHOLD = 0.35;
const MAX_SITUATIONAL = 5;
/** Items drawn from any single threat, so the list covers the draft. */
const MAX_PER_TAG = 2;

/**
 * Sums the enemy lineup into a threat profile, keeping track of which heroes
 * contributed so the recommendation can name them. "BKB because Lina and Lion"
 * teaches; a list of item icons does not.
 */
export function threatVector(data: ItemData, enemyIds: number[]): Threat[] {
  const totals = new Map<ThreatTag, { total: number; contributors: { id: number; s: number }[] }>();
  for (const id of enemyIds) {
    for (const [tag, strength] of Object.entries(data.threats[id] ?? {}) as [ThreatTag, number][]) {
      const entry = totals.get(tag) ?? { total: 0, contributors: [] };
      entry.total += strength;
      entry.contributors.push({ id, s: strength });
      totals.set(tag, entry);
    }
  }
  return [...totals]
    .map(([tag, v]) => ({
      tag,
      total: v.total,
      enemies: v.contributors
        .filter((c) => c.s >= BLAME_THRESHOLD)
        .sort((a, b) => b.s - a.s)
        .map((c) => c.id),
    }))
    .sort((a, b) => b.total - a.total);
}

function fill(template: string, enemies: number[], name: (id: number) => string): string {
  const named = enemies.slice(0, 2).map(name);
  const phrase =
    named.length === 0
      ? 'their lineup'
      : named.length === 1
        ? `their ${named[0]}`
        : `their ${named[0]} and ${named[1]}`;
  return template.replace('{enemies}', phrase);
}

/**
 * Items are a rule problem, not a statistical one — good players already know
 * the rules — so the build is the statistical core plus a rule engine driven by
 * the enemy lineup, split into the three buckets players actually think in.
 */
export function itemBuild(
  data: ItemData,
  myHeroId: number,
  enemyIds: number[],
  heroName: (id: number) => string,
): ItemBuild {
  const itemName = (key: string): ItemRef =>
    data.names[key] ?? { key, name: key.replace(/_/g, ' '), cost: 0 };
  const threats = threatVector(data, enemyIds);
  const active = new Map(threats.filter((t) => t.total >= TAG_THRESHOLD).map((t) => [t.tag, t]));
  const core = data.core[myHeroId] ?? [];
  const coreKeys = new Set(core.map((c) => c.key));

  const best = new Map<string, Recommendation & { score: number; tag: ThreatTag }>();
  for (const rule of data.rules) {
    const threat = active.get(rule.counters);
    if (!threat) continue;
    // Already in the core build — recommending it again as situational would
    // double-count and tell the player nothing new.
    if (coreKeys.has(rule.item)) continue;
    const score = rule.weight * threat.total;
    const prior = best.get(rule.item);
    if (prior && prior.score >= score) continue;
    const ref = itemName(rule.item);
    best.set(rule.item, {
      tag: rule.counters,
      key: rule.item,
      name: ref.name,
      cost: ref.cost,
      reason: fill(rule.reason, threat.enemies, heroName),
      enemies: threat.enemies,
      score,
    });
  }

  // Cap per tag, or the biggest threat eats every slot: against a magic lineup
  // that also has an invisible hero, four magic-resist variants crowd out the
  // sentries, and detection is both cheaper and more urgent than a fourth Hood.
  const perTag = new Map<ThreatTag, number>();
  const because: Recommendation[] = [];
  for (const entry of [...best.values()].sort((a, b) => b.score - a.score)) {
    const used = perTag.get(entry.tag) ?? 0;
    if (used >= MAX_PER_TAG) continue;
    perTag.set(entry.tag, used + 1);
    const { score: _score, tag: _tag, ...rest } = entry;
    because.push(rest);
    if (because.length >= MAX_SITUATIONAL) break;
  }

  const skip: Recommendation[] = [];
  for (const rule of data.skipRules) {
    if (!coreKeys.has(rule.item)) continue;
    const threat = active.get(rule.weakenedBy);
    if (!threat) continue;
    const ref = itemName(rule.item);
    skip.push({
      key: rule.item,
      name: ref.name,
      cost: ref.cost,
      reason: fill(rule.reason, threat.enemies, heroName),
      enemies: threat.enemies,
    });
  }

  const skipKeys = new Set(skip.map((s) => s.key));
  return {
    core: core.filter((c) => !skipKeys.has(c.key)),
    because,
    skip,
    threats: threats.filter((t) => t.total >= TAG_THRESHOLD),
  };
}

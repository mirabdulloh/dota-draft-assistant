import type { ItemRule, SkipRule, ThreatTag } from '@dota/engine';

export type { ItemRule, SkipRule };

/**
 * LAYER 2 DATA — PROPOSED BY AN LLM, NOT YET HUMAN-APPROVED.
 *
 * Which item answers which threat, and the sentence shown to the player. The
 * reason string is the product: a list of item icons teaches nothing, while
 * "BKB — their Lina and Lion can burst you from full" teaches, and a player
 * who learns keeps the app.
 *
 * `{enemies}` is replaced with the enemy heroes that actually triggered the
 * rule, so the sentence always names real heroes from the current draft.
 *
 * Item keys are dotaconstants keys and are validated at export.
 */
export const ITEM_RULES: ItemRule[] = [
  // magic burst
  { item: 'black_king_bar', counters: 'magic_burst', weight: 1.0, reason: '{enemies} can burst you from full' },
  { item: 'pipe', counters: 'magic_burst', weight: 0.8, reason: 'soaks the magic damage from {enemies}' },
  { item: 'eternal_shroud', counters: 'magic_burst', weight: 0.6, reason: 'turns {enemies} damage into your mana' },
  { item: 'glimmer_cape', counters: 'magic_burst', weight: 0.6, reason: 'magic resist when {enemies} jump you' },
  { item: 'hood_of_defiance', counters: 'magic_burst', weight: 0.5, reason: 'early answer to {enemies}' },

  // physical carries
  { item: 'crimson_guard', counters: 'physical_carry', weight: 0.9, reason: 'blocks right-click damage from {enemies}' },
  { item: 'ghost', counters: 'physical_carry', weight: 0.8, reason: 'makes you immune to {enemies} attacks' },
  { item: 'heavens_halberd', counters: 'physical_carry', weight: 0.8, reason: 'disarms {enemies} for seven seconds' },
  { item: 'solar_crest', counters: 'physical_carry', weight: 0.5, reason: 'strips armour and evasion from {enemies}' },
  { item: 'assault', counters: 'physical_carry', weight: 0.5, reason: 'team armour against {enemies}' },

  // single-target lockdown
  { item: 'sphere', counters: 'single_target_disable', weight: 1.0, reason: 'eats the first spell from {enemies}' },
  { item: 'lotus_orb', counters: 'single_target_disable', weight: 0.8, reason: 'reflects lockdown from {enemies}' },
  { item: 'cyclone', counters: 'single_target_disable', weight: 0.6, reason: 'self-purge once {enemies} land on you' },
  { item: 'manta', counters: 'single_target_disable', weight: 0.5, reason: 'dispels what {enemies} put on you' },

  // healing and regeneration
  { item: 'spirit_vessel', counters: 'heavy_healing', weight: 1.0, reason: 'cuts the healing on {enemies}' },
  { item: 'shivas_guard', counters: 'heavy_healing', weight: 0.8, reason: 'area healing reduction against {enemies}' },
  { item: 'skadi', counters: 'heavy_healing', weight: 0.7, reason: 'slows and reduces healing on {enemies}' },

  // evasion
  { item: 'monkey_king_bar', counters: 'evasion', weight: 1.0, reason: 'true strike through {enemies} evasion' },
  { item: 'bloodthorn', counters: 'evasion', weight: 0.7, reason: 'silences and guarantees hits on {enemies}' },

  // passives
  { item: 'silver_edge', counters: 'strong_passive', weight: 1.0, reason: 'breaks the passive on {enemies}' },

  // invisibility
  { item: 'ward_sentry', counters: 'invisibility', weight: 1.0, reason: '{enemies} can go invisible — carry sentries' },
  { item: 'dust', counters: 'invisibility', weight: 0.9, reason: 'reveals {enemies} when they jump you' },
  { item: 'gem', counters: 'invisibility', weight: 0.6, reason: 'permanent detection for {enemies}' },

  // illusions and summons
  { item: 'mjollnir', counters: 'illusions_summons', weight: 1.0, reason: 'chain lightning clears {enemies} illusions' },
  { item: 'bfury', counters: 'illusions_summons', weight: 0.7, reason: 'cleave clears {enemies} illusions' },
  { item: 'radiance', counters: 'illusions_summons', weight: 0.6, reason: 'burn melts {enemies} summons' },
  { item: 'shivas_guard', counters: 'illusions_summons', weight: 0.5, reason: 'area damage against {enemies} illusions' },

  // blink initiators
  { item: 'force_staff', counters: 'blink_initiator', weight: 0.8, reason: 'escape the initiation from {enemies}' },
  { item: 'lotus_orb', counters: 'blink_initiator', weight: 0.6, reason: 'punishes {enemies} for initiating on you' },
  { item: 'glimmer_cape', counters: 'blink_initiator', weight: 0.5, reason: 'survive the jump from {enemies}' },

  // buff and heal dependence
  { item: 'nullifier', counters: 'buff_dependent', weight: 1.0, reason: 'dispels what {enemies} rely on' },
  { item: 'spirit_vessel', counters: 'buff_dependent', weight: 0.4, reason: 'cuts the sustain {enemies} give' },

  // physical immunity
  { item: 'nullifier', counters: 'physical_immunity', weight: 0.9, reason: 'pierces {enemies} protection' },
  { item: 'shivas_guard', counters: 'physical_immunity', weight: 0.4, reason: 'magic damage while {enemies} block physical' },

  // silences
  { item: 'black_king_bar', counters: 'silence', weight: 0.7, reason: 'play through the silence from {enemies}' },
  { item: 'sphere', counters: 'silence', weight: 0.6, reason: 'blocks the silence from {enemies}' },
];

/**
 * Items normally good on a hero that get noticeably worse into certain enemies.
 * Only applied to items already in that hero's statistical core, so the advice
 * is always "skip something you would otherwise have bought".
 */
export const SKIP_RULES: SkipRule[] = [
  { item: 'butterfly', weakenedBy: 'physical_immunity', reason: '{enemies} can turn off your physical damage' },
  { item: 'greater_crit', weakenedBy: 'physical_immunity', reason: 'crit does nothing through {enemies}' },
  { item: 'greater_crit', weakenedBy: 'evasion', reason: 'crit is wasted against {enemies} evasion' },
  { item: 'satanic', weakenedBy: 'heavy_healing', reason: 'lifesteal loses the race against {enemies} sustain' },
  { item: 'radiance', weakenedBy: 'magic_burst', reason: 'too slow when {enemies} can kill you first' },
  { item: 'bfury', weakenedBy: 'magic_burst', reason: 'farming item into a lineup that kills you early' },
  { item: 'blink', weakenedBy: 'silence', reason: '{enemies} can silence you before you blink out' },
  { item: 'heart', weakenedBy: 'buff_dependent', reason: 'raw HP does little against {enemies} dispels' },
];

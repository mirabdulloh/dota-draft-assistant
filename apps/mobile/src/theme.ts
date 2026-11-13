/**
 * Dark only, by design: the user is in a dark room looking at a dark game, on a
 * phone held in one hand while watching a monitor. Tap targets are sized for a
 * thumb under a pick timer, not for precision.
 */
export const C = {
  bg: '#0E1116',
  surface: '#171C24',
  surfaceAlt: '#1F2630',
  border: '#2A323E',
  text: '#E8EDF4',
  dim: '#8793A3',
  faint: '#5A6676',
  accent: '#4AA3FF',
  radiant: '#5BC98B',
  dire: '#E05A5A',
  warn: '#E8A33D',
} as const;

export const S = {
  gap: 8,
  pad: 14,
  radius: 10,
  /** Minimum comfortable one-thumb target. */
  tap: 52,
} as const;

export const portraitUrl = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;

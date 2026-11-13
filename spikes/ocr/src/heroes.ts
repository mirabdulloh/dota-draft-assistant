import { heroes } from 'dotaconstants';

export const CDN = 'https://cdn.cloudflare.steamstatic.com';

export type Hero = {
  id: number;
  slug: string;
  name: string;
  localizedName: string;
};

/** `img` looks like `/apps/dota2/images/dota_react/heroes/antimage.png?` */
function slugFromImg(img: string): string {
  const base = img.split('?')[0].split('/').pop();
  if (!base) throw new Error(`cannot derive slug from img: ${img}`);
  return base.replace(/\.png$/, '');
}

export function heroList(): Hero[] {
  return Object.values(heroes as Record<string, any>)
    .map((h) => ({
      id: h.id,
      slug: slugFromImg(h.img),
      name: h.name,
      localizedName: h.localized_name,
    }))
    .sort((a, b) => a.id - b.id);
}

export const variants = {
  landscape: (slug: string) => `${CDN}/apps/dota2/images/dota_react/heroes/${slug}.png`,
  vert: (slug: string) => `${CDN}/apps/dota2/images/dota_react/heroes/crops/${slug}.png`,
} as const;

export type VariantName = keyof typeof variants;

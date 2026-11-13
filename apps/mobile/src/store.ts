import { create } from 'zustand';
import type { PickOrder, Position } from '@dota/engine';
import type { Bracket } from './snapshot';

export type SlotTarget = { team: 'enemy' | 'ally' | 'me' | 'ban'; index: number } | null;

type DraftStore = {
  bracket: Bracket;
  position: Position;
  pickOrder: PickOrder;
  enemies: (number | null)[];
  allies: (number | null)[];
  started: boolean;
  showItems: boolean;
  myHero: number | null;
  banned: number[];
  detailHero: number | null;
  picking: SlotTarget;

  setBracket: (b: Bracket) => void;
  setPosition: (p: Position) => void;
  setPickOrder: (o: PickOrder) => void;
  start: () => void;
  reset: () => void;
  openPicker: (t: SlotTarget) => void;
  setShowItems: (v: boolean) => void;
  setDetailHero: (id: number | null) => void;
  assign: (heroId: number) => void;
  clearSlot: (team: 'enemy' | 'ally' | 'me', index: number) => void;
};

const empty = () => [null, null, null, null, null] as (number | null)[];

export const useDraft = create<DraftStore>((set) => ({
  bracket: 5,
  position: 5,
  pickOrder: 'last',
  enemies: empty(),
  // Four ally slots: the fifth is the user's own pick, which is what we suggest.
  allies: [null, null, null, null],
  started: false,
  showItems: false,
  myHero: null,
  banned: [],
  detailHero: null,
  picking: null,

  setBracket: (bracket) => set({ bracket }),
  setPosition: (position) => set({ position }),
  setPickOrder: (pickOrder) => set({ pickOrder }),
  start: () => set({ started: true }),
  reset: () =>
    set({
      started: false,
      showItems: false,
      myHero: null,
      banned: [],
      detailHero: null,
      enemies: empty(),
      allies: [null, null, null, null],
      picking: null,
    }),
  setShowItems: (showItems) => set({ showItems }),
  setDetailHero: (detailHero) => set({ detailHero }),
  openPicker: (picking) => set({ picking }),
  assign: (heroId) =>
    set((s) => {
      if (!s.picking) return s;
      const { team, index } = s.picking;
      if (team === 'me') return { myHero: heroId, picking: null } as Partial<DraftStore>;
      // Tapping an already-banned hero in ban mode lifts the ban.
      if (team === 'ban') {
        const banned = s.banned.includes(heroId)
          ? s.banned.filter((b) => b !== heroId)
          : [...s.banned, heroId];
        return { banned } as Partial<DraftStore>;
      }
      const key = team === 'enemy' ? 'enemies' : 'allies';
      const next = [...s[key]];
      next[index] = heroId;
      return { [key]: next, picking: null } as Partial<DraftStore>;
    }),
  clearSlot: (team, index) =>
    set((s) => {
      if (team === 'me') return { myHero: null } as Partial<DraftStore>;
      const key = team === 'enemy' ? 'enemies' : 'allies';
      const next = [...s[key]];
      next[index] = null;
      return { [key]: next } as Partial<DraftStore>;
    }),
}));

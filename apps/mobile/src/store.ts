import { create } from 'zustand';
import type { PickOrder, Position } from '@dota/engine';

export type SlotTarget = { team: 'enemy' | 'ally'; index: number } | null;

type DraftStore = {
  position: Position;
  pickOrder: PickOrder;
  enemies: (number | null)[];
  allies: (number | null)[];
  started: boolean;
  picking: SlotTarget;

  setPosition: (p: Position) => void;
  setPickOrder: (o: PickOrder) => void;
  start: () => void;
  reset: () => void;
  openPicker: (t: SlotTarget) => void;
  assign: (heroId: number) => void;
  clearSlot: (team: 'enemy' | 'ally', index: number) => void;
};

const empty = () => [null, null, null, null, null] as (number | null)[];

export const useDraft = create<DraftStore>((set) => ({
  position: 5,
  pickOrder: 'last',
  enemies: empty(),
  // Four ally slots: the fifth is the user's own pick, which is what we suggest.
  allies: [null, null, null, null],
  started: false,
  picking: null,

  setPosition: (position) => set({ position }),
  setPickOrder: (pickOrder) => set({ pickOrder }),
  start: () => set({ started: true }),
  reset: () =>
    set({ started: false, enemies: empty(), allies: [null, null, null, null], picking: null }),
  openPicker: (picking) => set({ picking }),
  assign: (heroId) =>
    set((s) => {
      if (!s.picking) return s;
      const { team, index } = s.picking;
      const key = team === 'enemy' ? 'enemies' : 'allies';
      const next = [...s[key]];
      next[index] = heroId;
      return { [key]: next, picking: null } as Partial<DraftStore>;
    }),
  clearSlot: (team, index) =>
    set((s) => {
      const key = team === 'enemy' ? 'enemies' : 'allies';
      const next = [...s[key]];
      next[index] = null;
      return { [key]: next } as Partial<DraftStore>;
    }),
}));

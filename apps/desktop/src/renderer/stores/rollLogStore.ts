import { create } from 'zustand';
import type { RollResult } from '@trifold/rules';

/** One shared roll log for the dice page and the combat tracker (DESIGN.md §6.7). */
export interface RollLogEntry {
  id: string;
  at: number;
  kind: 'dice' | 'attack' | 'damage' | 'save' | 'check' | 'other';
  label: string;
  expression: string;
  total: number;
  /** Faces rolled, formatted for display (`2d6: 4, 2`). */
  faces: string;
  actor?: string;
  note?: string;
}

const LIMIT = 500;
let seq = 0;

export function facesText(result: RollResult): string {
  return result.dice
    .map((d) => {
      const kept = d.kept.length !== d.rolls.length ? ` → ${d.kept.join(', ')}` : '';
      return `${d.term.count}d${d.term.sides}: ${d.rolls.join(', ')}${kept}`;
    })
    .join(' · ');
}

interface RollLogState {
  entries: RollLogEntry[];
  add(entry: Omit<RollLogEntry, 'id' | 'at'>): RollLogEntry;
  clear(): void;
}

export const useRollLogStore = create<RollLogState>((set, get) => ({
  entries: [],
  add(entry) {
    seq += 1;
    const full: RollLogEntry = { ...entry, id: `roll-${Date.now()}-${seq}`, at: Date.now() };
    set({ entries: [full, ...get().entries].slice(0, LIMIT) });
    return full;
  },
  clear() {
    set({ entries: [] });
  },
}));

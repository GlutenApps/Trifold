import { create } from 'zustand';
import { facesText } from '@trifold/rules';

/**
 * The one shared roll log (DESIGN.md §6.7; ADR 0004, one roll log): every roll in the app lands
 * here with its source, whether it came from the Dice pop-up or the strip's pool (ADR 0009),
 * the combat tracker, or a stat block read in the Compendium. It is in memory only, capped at
 * `LIMIT` entries and cleared on restart; a fight's own narrative log is saved with the
 * encounter and is a different thing. Any feature may add; the entries are read-only.
 */
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
  /** A natural 20 or natural 1 on the d20, for the reveal's flourish. */
  outcome?: 'crit' | 'fumble';
  /**
   * Where the roll came from (ADR 0004, one roll log): the pool, the tracker, a save call, a
   * stat block read outside a fight, or `table`, a roll made at the table for a player and
   * shown in every roll log there (ADR 0059).
   */
  source: 'pool' | 'tracker' | 'compendium' | 'table';
  /** The fight the roll belongs to, when it came from the tracker. */
  encounterId?: string;
}

const LIMIT = 500;
let seq = 0;

// The formatting lives with the dice, so the table server words its rolls the same way.
export { facesText };

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

import type { Rng } from '../dice';
import { rollD20, type RollMode } from './rolls';

/** Initiative, ordering, death saves, quick-add and name masking (DESIGN.md §6.3–6.4). */

export interface InitiativeEntry {
  initiative: number | null;
  dexterity: number;
  /** Position in the original list, used as the final tie-break. */
  order: number;
  isLair?: boolean;
}

/** Initiative descending, then Dex, then original order; the Lair entry wins ties at 20. */
export function compareInitiative(a: InitiativeEntry, b: InitiativeEntry): number {
  const ai = a.initiative ?? Number.NEGATIVE_INFINITY;
  const bi = b.initiative ?? Number.NEGATIVE_INFINITY;
  if (ai !== bi) return bi - ai;
  if (Boolean(a.isLair) !== Boolean(b.isLair)) return a.isLair ? -1 : 1;
  if (a.dexterity !== b.dexterity) return b.dexterity - a.dexterity;
  return a.order - b.order;
}

export function rollInitiative(
  bonus: number,
  mode: RollMode = 'normal',
  rng: Rng = Math.random,
): number {
  return rollD20(bonus, mode, rng).total;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface DeathSaveOutcome {
  saves: DeathSaves;
  /** A natural 20: the character regains 1 HP. */
  revived: boolean;
  stable: boolean;
  dead: boolean;
  natural: number;
}

/** Nat 20 regains 1 HP, nat 1 counts as two failures, 10+ succeeds (DESIGN.md §6.4). */
export function applyDeathSave(saves: DeathSaves, natural: number): DeathSaveOutcome {
  if (natural === 20)
    return {
      saves: { successes: 0, failures: 0 },
      revived: true,
      stable: false,
      dead: false,
      natural,
    };
  const next = { ...saves };
  if (natural === 1) next.failures = Math.min(3, next.failures + 2);
  else if (natural >= 10) next.successes = Math.min(3, next.successes + 1);
  else next.failures = Math.min(3, next.failures + 1);
  const dead = next.failures >= 3;
  const stable = !dead && next.successes >= 3;
  return {
    saves: stable ? { successes: 0, failures: 0 } : next,
    revived: false,
    stable,
    dead,
    natural,
  };
}

/** Player-facing name for a creature: its type, capitalized (DESIGN.md §6.4). */
export function maskedNameFor(type: string, fallback = 'Creature'): string {
  const t = type.trim();
  if (!t) return fallback;
  return t[0]!.toUpperCase() + t.slice(1);
}

/** `Goblin`, `Goblin 2`, `Goblin 3`… for groups of identical creatures. */
export function numberedNames(base: string, quantity: number): string[] {
  if (quantity <= 1) return [base];
  return Array.from({ length: quantity }, (_, i) => `${base} ${i + 1}`);
}

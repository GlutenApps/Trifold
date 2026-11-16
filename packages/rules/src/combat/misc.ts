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

const trailingNumber = /^(.*\S)\s+(\d+)$/;

/**
 * The name for one more creature called `base` beside `existing`: the first keeps the plain name,
 * later ones take the next number (Goblin, Goblin 2, Goblin 3), as a fight numbers its joiners.
 */
export function nextNumberedName(base: string, existing: readonly string[]): string {
  let found = false;
  let highest = 1;
  for (const name of existing) {
    if (name === base) found = true;
    const m = trailingNumber.exec(name);
    if (m && m[1] === base) {
      found = true;
      highest = Math.max(highest, Number(m[2]));
    }
  }
  return found ? `${base} ${highest + 1}` : base;
}

/**
 * What players read for each creature (the TV's strip and tokens, the phones): `shown` is the
 * name or its mask, and a masked name takes the number of the real one, so Goblin 3 shows as
 * Humanoid 3 and its chip matches its token. Names that would still read the same (two kinds of
 * creature behind one mask) are numbered in order, skipping numbers already shown.
 */
export function playerLabels(
  items: ReadonlyArray<{ id: string; name: string; shown: string }>,
): Map<string, string> {
  const first = items.map((it) => {
    if (it.shown === it.name || trailingNumber.test(it.shown)) return it.shown;
    const m = trailingNumber.exec(it.name);
    return m ? `${it.shown} ${m[2]}` : it.shown;
  });
  const count = new Map<string, number>();
  for (const label of first) count.set(label, (count.get(label) ?? 0) + 1);
  const used = new Set(first);
  const out = new Map<string, string>();
  const next = new Map<string, number>();
  items.forEach((it, i) => {
    const label = first[i]!;
    if ((count.get(label) ?? 0) < 2) return out.set(it.id, label);
    // Duplicates: the first keeps its label, the rest get the next free number on the base.
    if (!next.has(label)) {
      next.set(label, 1);
      return out.set(it.id, label);
    }
    const base = trailingNumber.exec(label)?.[1] ?? label;
    let n = next.get(label)! + 1;
    while (used.has(`${base} ${n}`)) n += 1;
    next.set(label, n);
    used.add(`${base} ${n}`);
    out.set(it.id, `${base} ${n}`);
  });
  return out;
}

/**
 * Names for an encounter's groups of creatures, numbered across the whole encounter: two
 * separate Goblin entries make Goblin 1 and Goblin 2, not two Goblins, so every token and
 * initiative chip can be told apart. A name used once stays plain.
 */
export function groupNames(groups: ReadonlyArray<{ base: string; quantity: number }>): string[][] {
  const total = new Map<string, number>();
  for (const g of groups) total.set(g.base, (total.get(g.base) ?? 0) + Math.max(0, g.quantity));
  const next = new Map<string, number>();
  return groups.map((g) => {
    if ((total.get(g.base) ?? 0) <= 1) return numberedNames(g.base, g.quantity);
    return Array.from({ length: g.quantity }, () => {
      const n = (next.get(g.base) ?? 0) + 1;
      next.set(g.base, n);
      return `${g.base} ${n}`;
    });
  });
}

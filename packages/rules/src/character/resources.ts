import type { CharacterEdition, Sheet } from '@trifold/schema';
import { scoreModifier } from './derive';

/**
 * Resources on a Trifold sheet (ADR 0074): spell slots spent, limited-use features, hit dice and
 * Heroic Inspiration, with short and long rests. Pure: the sheet screens call these and save the
 * sheet. HP and death saves stay the table's; a hit die's healing is sent to it as an HP change.
 */

export type HitDie = '6' | '8' | '10' | '12';

/** Each class's hit die, by name; the SRD's classes and a few common others. */
const HIT_DIE: Readonly<Record<string, HitDie>> = {
  barbarian: '12',
  fighter: '10',
  paladin: '10',
  ranger: '10',
  artificer: '8',
  bard: '8',
  cleric: '8',
  druid: '8',
  monk: '8',
  rogue: '8',
  warlock: '8',
  sorcerer: '6',
  wizard: '6',
};

/** A class's hit die by its name; d8 for one Trifold does not know. */
export function hitDieOf(className: string): HitDie {
  return HIT_DIE[className.trim().toLowerCase()] ?? '8';
}

export interface HitDicePool {
  die: HitDie;
  total: number;
  left: number;
}

/** Hit dice by die size, largest first: one per class level, less those spent. */
export function hitDice(sheet: Pick<Sheet, 'classes' | 'hitDiceUsed'>): HitDicePool[] {
  const totals = new Map<HitDie, number>();
  for (const c of sheet.classes) {
    if (!c.name.trim()) continue;
    const die = hitDieOf(c.name);
    totals.set(die, (totals.get(die) ?? 0) + c.level);
  }
  return [...totals.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([die, total]) => ({
      die,
      total,
      left: Math.max(0, total - (sheet.hitDiceUsed?.[die] ?? 0)),
    }));
}

/**
 * One hit die spent: the die rolled plus Constitution, at least 1. Returns the sheet with the
 * die marked spent and the hit points it heals, or null when none of that size is left.
 */
export function spendHitDie(
  sheet: Sheet,
  die: HitDie,
  roll: (sides: number) => number,
): { sheet: Sheet; healed: number; rolled: number } | null {
  const pool = hitDice(sheet).find((p) => p.die === die);
  if (!pool || pool.left <= 0) return null;
  const rolled = roll(Number(die));
  const healed = Math.max(1, rolled + scoreModifier(sheet.abilities.con));
  return {
    sheet: {
      ...sheet,
      hitDiceUsed: { ...sheet.hitDiceUsed, [die]: (sheet.hitDiceUsed?.[die] ?? 0) + 1 },
    },
    healed,
    rolled,
  };
}

/** Spell slots of one level (1st first, like `slots`): how many, and how many are left. */
export function slotsAt(
  sheet: Pick<Sheet, 'slots' | 'slotsUsed'>,
  level: number,
): {
  max: number;
  left: number;
} {
  const max = sheet.slots[level - 1] ?? 0;
  return { max, left: Math.max(0, max - (sheet.slotsUsed?.[level - 1] ?? 0)) };
}

/**
 * Marks `used` slots of one level spent, held between none and all of them. The sheet the
 * slot pips and the cast action save.
 */
export function setSlotsUsed(sheet: Sheet, level: number, used: number): Sheet {
  const max = sheet.slots[level - 1] ?? 0;
  const slotsUsed = [...(sheet.slotsUsed ?? [])];
  while (slotsUsed.length < level) slotsUsed.push(0);
  slotsUsed[level - 1] = Math.min(max, Math.max(0, used));
  return { ...sheet, slotsUsed };
}

/** Casting with a slot of `level`: one more spent, or null when none of that level is left. */
export function spendSlot(sheet: Sheet, level: number): Sheet | null {
  const { max, left } = slotsAt(sheet, level);
  if (left <= 0) return null;
  return setSlotsUsed(sheet, level, max - left + 1);
}

/** The slot levels a spell of `level` can be cast with: its own and every higher one there is. */
export function slotChoices(
  sheet: Pick<Sheet, 'slots' | 'slotsUsed'>,
  level: number,
): { level: number; max: number; left: number }[] {
  const out: { level: number; max: number; left: number }[] = [];
  for (let l = Math.max(1, level); l <= sheet.slots.length; l++) {
    const { max, left } = slotsAt(sheet, l);
    if (max > 0) out.push({ level: l, max, left });
  }
  return out;
}

/**
 * Casting a spell (docs/CHARACTER-SHEET.md, items 13 and 14): a cantrip spends nothing, any
 * other spell a slot of `slotLevel` (its own level or higher, to upcast). A concentration spell
 * becomes what the character concentrates on, ending the one before (`ended`). Null when that
 * slot is spent or below the spell's level.
 */
export function castSpell(
  sheet: Sheet,
  spell: Pick<Sheet['spells'][number], 'id' | 'name' | 'level' | 'ref'>,
  slotLevel: number,
  concentration: boolean,
): { sheet: Sheet; ended: string | null } | null {
  let next = sheet;
  if (spell.level > 0) {
    if (slotLevel < spell.level) return null;
    const spent = spendSlot(sheet, slotLevel);
    if (!spent) return null;
    next = spent;
  }
  if (!concentration) return { sheet: next, ended: null };
  const ended = sheet.concentrating?.name ?? null;
  return {
    sheet: {
      ...next,
      concentrating: {
        name: spell.name || 'Spell',
        spellId: spell.id,
        ...(spell.ref ? { ref: spell.ref } : {}),
      },
    },
    ended,
  };
}

/** Concentration ends: by hand, or because the spell is done. */
export function endConcentration(sheet: Sheet): Sheet {
  const next = { ...sheet };
  delete next.concentrating;
  return next;
}

/** What a rest brought back, to say so. */
export interface RestResult {
  sheet: Sheet;
  /** Names of what came back: features, "spell slots", "hit dice". */
  restored: string[];
}

const spentSlots = (sheet: Sheet) => (sheet.slotsUsed ?? []).some((n) => n > 0);

/** Items with spent charges that come back on this rest: a short rest, or any rest that is long. */
function refillItems(sheet: Sheet, long: boolean, restored: string[]): Sheet['equipment'] {
  return sheet.equipment.map((item) => {
    if (!item.uses || item.uses.used === 0 || (!long && item.uses.reset !== 'short')) return item;
    restored.push(item.name || 'Item');
    return { ...item, uses: { ...item.uses, used: 0 } };
  });
}

/** A short rest: features and item charges that recharge on one, and Pact Magic slots. */
export function shortRest(sheet: Sheet): RestResult {
  const restored: string[] = [];
  const features = sheet.features.map((f) => {
    if (!f.uses || f.uses.reset !== 'short' || f.uses.used === 0) return f;
    restored.push(f.name || 'Feature');
    return { ...f, uses: { ...f.uses, used: 0 } };
  });
  const equipment = refillItems(sheet, false, restored);
  const slots = sheet.slotsOnShortRest && spentSlots(sheet);
  if (slots) restored.push('spell slots');
  return {
    sheet: { ...sheet, features, equipment, ...(slots ? { slotsUsed: [] } : {}) },
    restored,
  };
}

/**
 * A long rest: every feature's uses, every item's charges (a dawn passes during one) and every
 * slot. Hit dice: all of them under the 2024 rules,
 * up to half the character's total (at least one) under the 2014 rules, largest dice first.
 */
export function longRest(sheet: Sheet, edition: CharacterEdition): RestResult {
  const restored: string[] = [];
  const features = sheet.features.map((f) => {
    if (!f.uses || f.uses.used === 0) return f;
    restored.push(f.name || 'Feature');
    return { ...f, uses: { ...f.uses, used: 0 } };
  });
  const equipment = refillItems(sheet, true, restored);
  if (spentSlots(sheet)) restored.push('spell slots');

  const pools = hitDice(sheet);
  const spent = pools.reduce((n, p) => n + (p.total - p.left), 0);
  let hitDiceUsed: Sheet['hitDiceUsed'] = {};
  if (edition === '2014') {
    const total = pools.reduce((n, p) => n + p.total, 0);
    let back = Math.max(1, Math.floor(total / 2));
    hitDiceUsed = { ...sheet.hitDiceUsed };
    for (const p of pools) {
      const used = hitDiceUsed[p.die] ?? 0;
      const take = Math.min(used, back);
      hitDiceUsed[p.die] = used - take;
      back -= take;
    }
  }
  if (spent > 0) restored.push('hit dice');
  return {
    // Eight hours outlast any concentration a character keeps up.
    sheet: endConcentration({ ...sheet, features, equipment, slotsUsed: [], hitDiceUsed }),
    restored,
  };
}

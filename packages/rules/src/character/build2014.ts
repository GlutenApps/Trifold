import type { Ability, SpeciesRecord } from '@trifold/schema';
import type { ClassOption } from './build2024';
import { scoreModifier } from './derive';
import type { EquipmentLine } from './equipment';

/**
 * The 2014 character builder's rules (docs/BUILDER.md, phase 8): SRD 5.1 races and subraces
 * with their ability score increases, the classes' (a)/(b) equipment lines, spells known and
 * prepared, and spell slots where the 2014 rules differ from 2024's. Pure: the builder reads the
 * bundled SRD 5.1 records and hands them in. Class records are read by `readClass`, which the
 * snapshot's SRD 5.1 classes now satisfy.
 */

const ABILITY_WORD: Readonly<Record<string, Ability>> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};
const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** A race's increases from its Ability Score Increase text, and how many +1s are the player's. */
export interface RaceIncrease {
  fixed: Partial<Record<Ability, number>>;
  /** "Two other ability scores of your choice increase by 1": two +1s to pick. */
  choose: number;
}

/**
 * "Your Strength score increases by 2, and your Charisma score increases by 1." → +2 Str, +1
 * Cha; "Your ability scores each increase by 1." → +1 to all six; "… and two other ability
 * scores of your choice increase by 1." → also two +1s to pick.
 */
export function readRaceIncrease(text: string): RaceIncrease {
  const fixed: Partial<Record<Ability, number>> = {};
  if (/ability scores each increase by (\d)/i.test(text)) {
    const n = Number(/each increase by (\d)/i.exec(text)![1]);
    for (const a of ABILITIES) fixed[a] = n;
  }
  for (const m of text.matchAll(/your (\w+) score increases by (\d)/gi)) {
    const a = ABILITY_WORD[m[1]!.toLowerCase()];
    if (a) fixed[a] = (fixed[a] ?? 0) + Number(m[2]);
  }
  const pick = /(\w+) other ability scores? of your choice increases? by 1/i.exec(text);
  const words: Record<string, number> = { one: 1, two: 2, three: 3 };
  const choose = pick ? (words[pick[1]!.toLowerCase()] ?? (Number(pick[1]) || 0)) : 0;
  return { fixed, choose };
}

export interface Subrace2014 {
  key: string;
  name: string;
  increase: RaceIncrease;
  traits: Array<{ name: string; text: string }>;
}

export interface Race2014 {
  key: string;
  name: string;
  size: 'Small' | 'Medium';
  speed: number;
  increase: RaceIncrease;
  /** Its languages, as written ("Common and Dwarvish"). */
  languages: string;
  traits: Array<{ name: string; text: string }>;
  subraces: Subrace2014[];
}

/** Traits the builder reads into numbers or leaves out. */
const SKIP = /^(description|ability score increase|age|alignment|size|speed|languages)$/i;

const trait = (r: SpeciesRecord, name: string) =>
  r.data.traits.find((t) => t.name.toLowerCase() === name)?.text ?? '';

const traitsOf = (r: SpeciesRecord) =>
  r.data.traits
    .filter((t) => !SKIP.test(t.name) && t.category !== 'description')
    .map((t) => ({ name: t.name, text: t.text }));

/**
 * The SRD 5.1 races with their subraces under them: a subrace (a record with `subspeciesOf`)
 * adds its increase and traits to its parent's. A base race without a Speed trait is left out.
 */
export function readRaces2014(records: readonly SpeciesRecord[]): Race2014[] {
  const subraces = new Map<string, Subrace2014[]>();
  for (const r of records) {
    const of = r.data.extra['subspeciesOf']?.[0];
    if (!of) continue;
    const list = subraces.get(of) ?? [];
    list.push({
      key: r.key,
      name: r.displayName,
      increase: readRaceIncrease(trait(r, 'ability score increase')),
      traits: traitsOf(r),
    });
    subraces.set(of, list);
  }
  const out: Race2014[] = [];
  for (const r of records) {
    if (r.data.extra['subspeciesOf']) continue;
    const speed = Number(/(\d+)\s*feet/i.exec(trait(r, 'speed'))?.[1] ?? 0);
    if (!speed) continue;
    out.push({
      key: r.key,
      name: r.displayName,
      size: /\bsmall\b/i.test(trait(r, 'size')) ? 'Small' : 'Medium',
      speed,
      increase: readRaceIncrease(trait(r, 'ability score increase')),
      languages: trait(r, 'languages'),
      traits: traitsOf(r),
      subraces: (subraces.get(r.key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Scores with a race's increases (2014): its own, its subrace's, and the +1s the player picked
 * (abilities the race does not already raise); no score above 20.
 */
export function withRaceIncrease(
  scores: Readonly<Record<Ability, number>>,
  race: Pick<Race2014, 'increase'>,
  subrace: Pick<Subrace2014, 'increase'> | null,
  chosen: readonly Ability[],
): Record<Ability, number> {
  const out = { ...scores };
  const add = (a: Ability, n: number) => (out[a] = Math.min(20, out[a] + n));
  for (const [a, n] of Object.entries(race.increase.fixed) as Array<[Ability, number]>) add(a, n);
  for (const [a, n] of Object.entries(subrace?.increase.fixed ?? {}) as Array<[Ability, number]>) {
    add(a, n);
  }
  for (const a of chosen.slice(0, race.increase.choose)) add(a, 1);
  return out;
}

// ---------- equipment ----------

const NUMBER: Readonly<Record<string, number>> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  twenty: 20,
};

/** Splits on commas and "and" outside brackets: "leather armor, longbow, and 20 arrows" → 3. */
function parts(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out
    .flatMap((p) => p.split(/\s+and\s+(?![^(]*\))/i))
    .map((p) => p.trim().replace(/^and\s+/i, ''))
    .filter(Boolean);
}

/** "two handaxes" → 2 handaxes; "20 arrows" → 20; "a dungeoneer's pack" → 1. */
function line(text: string): EquipmentLine {
  const m = /^(\d+|a|an|one|two|three|four|five|ten|twenty)\s+(.+)$/i.exec(text.trim());
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (!m) return { name: cap(text.trim()), quantity: 1 };
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : (NUMBER[m[1]!.toLowerCase()] ?? 1);
  return { name: cap(m[2]!.trim()), quantity: n };
}

/**
 * A class's equipment line as choices: "(a) chain mail or (b) leather armor, longbow, and 20
 * arrows" → two; "A spellbook" → one (no choice).
 */
export function equipmentChoices2014(text: string): string[] {
  const marked = text.split(/\s*\(([a-z])\)\s*/i).filter((s) => s && !/^[a-z]$/i.test(s));
  if (!/\([a-z]\)/i.test(text)) return [text.trim()];
  return marked
    .map((s) =>
      s
        .replace(/\s+or\s*$/i, '')
        .replace(/,\s*$/, '')
        .trim(),
    )
    .filter(Boolean);
}

/** A choice's items and the gold in it ("a pouch containing 15 gp"). */
export function equipmentItems2014(text: string): { items: EquipmentLine[]; gp: number } {
  const items: EquipmentLine[] = [];
  let gp = 0;
  for (const p of parts(text)) {
    const gold = /(\d+)\s*gp\b/i.exec(p);
    if (gold && /pouch|purse|gp$/i.test(p)) {
      gp += Number(gold[1]);
      continue;
    }
    items.push(line(p));
  }
  return { items, gp };
}

// ---------- spells ----------

/** Spells known by class level, for the 2014 classes that know spells (SRD 5.1 class tables). */
const KNOWN_2014: Readonly<Record<string, readonly number[]>> = {
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
};

/** The 2014 classes that prepare spells, and how many: the casting modifier plus a level. */
const PREPARES_2014: Readonly<Record<string, (level: number) => number>> = {
  cleric: (l) => l,
  druid: (l) => l,
  wizard: (l) => l,
  paladin: (l) => Math.floor(l / 2),
};

export interface SpellCounts2014 {
  cantrips: number;
  /** Spells known, or prepared, at this level. */
  spells: number;
  /** Whether `spells` are prepared from the class's list (cleric, druid, paladin, wizard). */
  prepares: boolean;
  /** A wizard's spellbook: six spells at 1st level, two more each level. */
  spellbook: number;
}

/** A 2014 class's cantrips and spells at a level, with its casting modifier for preparing. */
export function spellCounts2014(
  cls: Pick<ClassOption, 'name' | 'column'>,
  level: number,
  castingScore: number,
): SpellCounts2014 {
  const l = Math.min(20, Math.max(1, level));
  const name = cls.name.toLowerCase();
  const cantrips = Number(cls.column('Cantrips Known', l)) || 0;
  const wizard = name === 'wizard';
  const prepare = PREPARES_2014[name];
  if (prepare) {
    const base = prepare(l);
    return {
      cantrips,
      spells: base > 0 ? Math.max(1, scoreModifier(castingScore) + base) : 0,
      prepares: true,
      spellbook: wizard ? 6 + 2 * (l - 1) : 0,
    };
  }
  const known = Number(cls.column('Spells Known', l)) || KNOWN_2014[name]?.[l - 1] || 0;
  return { cantrips, spells: known, prepares: false, spellbook: 0 };
}

/**
 * A 2014 class's spell slots where they differ from the 2024 tables: half casters have none at
 * 1st level, and a warlock's slot level follows its level (the SRD 5.1 table's Slot Level).
 */
export function spellSlots2014(
  cls: Pick<ClassOption, 'casterType' | 'column'>,
  level: number,
  slots2024: readonly number[],
): number[] {
  const l = Math.min(20, Math.max(1, level));
  if (cls.casterType === 'HALF' && l === 1) return [];
  if (cls.casterType === 'PACT') {
    const count = Number(cls.column('Spell Slots', l)) || 0;
    const slotLevel =
      Number(/(\d)/.exec(cls.column('Slot Level', l))?.[1] ?? 0) || Math.min(5, Math.ceil(l / 2));
    if (!count) return [];
    const out = Array<number>(slotLevel).fill(0);
    out[slotLevel - 1] = count;
    return out;
  }
  return [...slots2024];
}

/** The level a 2014 class picks its subclass at, from the feature that grants it. */
export const SUBCLASS_FEATURE_2014 =
  /^(primal path|bard college|divine domain|druid circle|martial archetype|monastic tradition|sacred oath|ranger archetype|roguish archetype|sorcerous origin|otherworldly patron|arcane tradition)$/i;

import type {
  Ability,
  BackgroundRecord,
  ClassRecord,
  FeatRecord,
  SpeciesRecord,
} from '@trifold/schema';

/**
 * The character builder's rules layer, 2024 (docs/BUILDER.md): typed readings of the bundled
 * SRD 5.2.1 records, and the rules arithmetic the builder needs. Game text stays in the records;
 * a record this cannot read gives null, and the builder leaves that step to the sheet. Keyed by
 * edition: the 2014 builder adds its own readers beside these.
 */

const ABILITY_BY_NAME: Readonly<Record<string, Ability>> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

/** "Insight and Religion", "A, B, and C" → ["Insight", "Religion"], ["A", "B", "C"]. */
export function splitList(text: string): string[] {
  return text
    .split(/,|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Starting equipment options, as the SRD writes them for classes and backgrounds:
 * "Choose A or B: (A) …; or (B) 75 GP" → ["A: …", "B: 75 GP"]. Text with no lettered options is
 * one option.
 */
export function equipmentOptions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\(([A-Z])\)\s*([^;]+?)\s*(?:;\s*(?:or\s*)?|$)/g)) {
    out.push(`${m[1]}: ${m[2]!.replace(/\.$/, '').trim()}`);
  }
  const plain = text.replace(/^\*?choose [^:]*:\*?\s*/i, '').trim();
  return out.length ? out : plain ? [plain] : [];
}

/** Gold in an option's text: "…, and 15 GP" → 15; "75 GP" → 75. */
export function optionGold(option: string): number {
  return Number(/(\d+)\s*GP\b/i.exec(option)?.[1] ?? 0);
}

export type CasterType = 'FULL' | 'HALF' | 'PACT' | 'NONE';

export interface ClassOption {
  key: string;
  name: string;
  hitDie: number;
  saves: Ability[];
  /** How many skills to choose, and from which; `any` is any skill. */
  skills: { choose: number; from: string[] | 'any' };
  armor: string;
  weapons: string;
  tools: string;
  /** Starting equipment options ("A: …"). */
  equipment: string[];
  primaryAbility: string;
  casterType: CasterType;
  /** The level the class's subclass is chosen at, read from its "<Class> Subclass" feature. */
  subclassLevel: number | null;
  /** Levels that grant an ability score improvement or a feat. */
  asiLevels: number[];
  /** A class table column's value at a level ("Cantrips", "Prepared Spells"), or ''. */
  column(name: string, level: number): string;
  /** The class's own features gained at a level. */
  features(level: number): Array<{ name: string; text: string }>;
}

/** A class record as the builder reads it; null when it has no core traits (manual entry). */
export function readClass(record: ClassRecord): ClassOption | null {
  const d = record.data;
  if (!d.hd || d.numSkills === undefined || d.extra['subclassOf']) return null;
  const parts = splitList(d.proficiency ?? '').flatMap((p) => p.split(/\s*,\s*/));
  const saves = parts.map((p) => ABILITY_BY_NAME[p.toLowerCase()]).filter((a): a is Ability => !!a);
  const skillsFrom = parts.filter((p) => !ABILITY_BY_NAME[p.toLowerCase()]);
  const caster = (d.extra['casterType']?.[0] ?? 'NONE').toUpperCase();
  // Every 2024 class picks its subclass at 3rd level; a record that does not say so (the
  // snapshot's Bard has no 3rd-level features) still gets it there.
  const subclassLevel =
    d.levels.find((l) => l.features.some((f) => /\bsubclass(es)?$/i.test(f.name)))?.level ??
    (record.edition === '2024' ? 3 : null);
  return {
    key: record.key,
    name: record.displayName,
    hitDie: d.hd,
    saves,
    skills: { choose: d.numSkills, from: d.extra['anySkills'] ? 'any' : skillsFrom },
    armor: d.armor ?? '',
    weapons: d.weapons ?? '',
    tools: d.tools ?? '',
    equipment: d.extra['equipment'] ?? [],
    primaryAbility: d.extra['primaryAbility']?.[0] ?? '',
    casterType: (['FULL', 'HALF', 'PACT'].includes(caster) ? caster : 'NONE') as CasterType,
    subclassLevel,
    asiLevels: d.levels.filter((l) => l.scoreImprovement).map((l) => l.level),
    column: (name, level) => d.extra[`table:${name}`]?.[level - 1] ?? '',
    features: (level) =>
      (d.levels.find((l) => l.level === level)?.features ?? []).map((f) => ({
        name: f.name,
        text: f.text,
      })),
  };
}

export interface BackgroundOption {
  key: string;
  name: string;
  /** The three abilities its increase can go to. */
  abilities: Ability[];
  /** Its origin feat as written ("Magic Initiate (Cleric)"), and the feat's name alone. */
  feat: string;
  featName: string;
  skills: string[];
  tool: string;
  equipment: string[];
}

/** A background record as the builder reads it; null without its ability scores and feat. */
export function readBackground(record: BackgroundRecord): BackgroundOption | null {
  const trait = (category: string) =>
    record.data.traits.find((t) => t.category === category)?.text.trim() ?? '';
  const abilities = splitList(trait('ability_score'))
    .map((a) => ABILITY_BY_NAME[a.toLowerCase()])
    .filter((a): a is Ability => !!a);
  const feat = trait('feat');
  if (abilities.length !== 3 || !feat) return null;
  return {
    key: record.key,
    name: record.displayName,
    abilities,
    feat,
    featName: feat.replace(/\s*\(.*\)\s*$/, ''),
    skills: splitList(trait('skill_proficiency') || record.data.proficiency || ''),
    tool: trait('tool_proficiency'),
    equipment: equipmentOptions(trait('equipment')),
  };
}

export interface SpeciesOption {
  key: string;
  name: string;
  /** The sizes it can be; a player picks when there are two. */
  sizes: Array<'Small' | 'Medium'>;
  speed: number;
  /** Its traits other than size and speed, as written. */
  traits: Array<{ name: string; text: string }>;
}

export function readSpecies(record: SpeciesRecord): SpeciesOption {
  const size = record.data.size ?? '';
  const sizes = (['Small', 'Medium'] as const).filter((s) => new RegExp(`\\b${s}\\b`).test(size));
  return {
    key: record.key,
    name: record.displayName,
    sizes: sizes.length ? [...sizes] : ['Medium'],
    speed: Number(/(\d+)/.exec(record.data.speed ?? '')?.[1] ?? 30),
    traits: record.data.traits
      .filter((t) => t.category !== 'size' && t.category !== 'speed')
      .map((t) => ({ name: t.name, text: t.text })),
  };
}

export type FeatCategory = 'origin' | 'general' | 'fightingStyle' | 'epicBoon';

/** A feat's category, from its prerequisite as the SRD writes it. */
export function featCategory(record: Pick<FeatRecord, 'data'>): FeatCategory {
  const p = record.data.prerequisite ?? '';
  if (!p.trim()) return 'origin';
  if (/fighting style/i.test(p)) return 'fightingStyle';
  if (/level 19/i.test(p)) return 'epicBoon';
  return 'general';
}

// ---------- ability scores ----------

/** The standard array. */
export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

/** Point buy: what each score costs, and the budget. */
export const POINT_BUY_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
export const POINT_BUY_BUDGET = 27;

/** Points spent on six scores, or null when one is outside 8–15. */
export function pointBuySpent(scores: readonly number[]): number | null {
  let total = 0;
  for (const s of scores) {
    const cost = POINT_BUY_COST[s];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

/** One rolled score: four d6, the lowest dropped. `d6` is the die to roll. */
export function rollAbilityScore(d6: () => number): { score: number; dice: number[] } {
  const dice = [d6(), d6(), d6(), d6()];
  const sorted = [...dice].sort((a, b) => a - b);
  return { score: sorted[1]! + sorted[2]! + sorted[3]!, dice };
}

/**
 * The background's increase (2024): +2 to one of its abilities and +1 to another, or +1 to all
 * three; no score above 20.
 */
export function withBackgroundIncrease(
  scores: Readonly<Record<Ability, number>>,
  increase: { plus2: Ability; plus1: Ability } | { all: readonly Ability[] },
): Record<Ability, number> {
  const out = { ...scores };
  const add = (a: Ability, n: number) => (out[a] = Math.min(20, out[a] + n));
  if ('all' in increase) for (const a of increase.all) add(a, 1);
  else {
    add(increase.plus2, 2);
    add(increase.plus1, 1);
  }
  return out;
}

// ---------- hit points and spell slots ----------

/** Hit points at 1st level: the hit die's maximum plus the Constitution modifier, at least 1. */
export function hitPointsAtFirstLevel(hitDie: number, conMod: number): number {
  return Math.max(1, hitDie + conMod);
}

/** The fixed hit points a level after the first gives: half the die plus one, plus Con. */
export function fixedHitPointsPerLevel(hitDie: number, conMod: number): number {
  return Math.max(1, hitDie / 2 + 1 + conMod);
}

/** Spell slots by slot level (index 0 is 1st level) for full casters, by class level. */
const FULL_CASTER: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** The same for half casters (2024: slots from 1st level). */
const HALF_CASTER: readonly (readonly number[])[] = [
  [2],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/**
 * A class's spell slots at a level, by slot level (index 0 is 1st). A Pact Magic class's come
 * from its own table columns ("Spell Slots" of "Slot Level"); a non-caster has none.
 */
export function spellSlots(
  option: Pick<ClassOption, 'casterType' | 'column'>,
  level: number,
): number[] {
  const l = Math.min(20, Math.max(1, level));
  if (option.casterType === 'FULL') return [...FULL_CASTER[l - 1]!];
  if (option.casterType === 'HALF') return [...HALF_CASTER[l - 1]!];
  if (option.casterType === 'PACT') {
    const count = Number(option.column('Spell Slots', l)) || 0;
    const slotLevel = Number(/(\d+)/.exec(option.column('Slot Level', l))?.[1] ?? 0);
    if (!count || !slotLevel) return [];
    const out = Array<number>(slotLevel).fill(0);
    out[slotLevel - 1] = count;
    return out;
  }
  return [];
}

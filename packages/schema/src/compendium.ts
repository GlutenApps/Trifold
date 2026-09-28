import { z } from 'zod';
import { Ability, Edition } from './common';
import { RECORD_SCHEMA_VERSION } from './record';

/** Kind-specific record shapes (DESIGN.md §5.1, DATA-FORMATS.md §2). Original text is preserved. */

/** A dice expression string; validated by `parseDice` from @trifold/rules at import time. */
export const DiceExpr = z.string();

export const UsesPer = z.enum(['day', 'turn', 'shortRest', 'longRest', 'rest']);
export type UsesPer = z.infer<typeof UsesPer>;

export const Uses = z.object({ count: z.number().int().positive(), per: UsesPer });
export type Uses = z.infer<typeof Uses>;

export const Recharge = z.object({ min: z.number().int().min(1).max(6), max: z.literal(6) });
export type Recharge = z.infer<typeof Recharge>;

export const DamagePart = z.object({ damage: DiceExpr, damageType: z.string().optional() });
export type DamagePart = z.infer<typeof DamagePart>;

export const Attack = z.object({
  label: z.string(),
  toHit: z.number().int().optional(),
  damage: DiceExpr.optional(),
  damageType: z.string().optional(),
  reach: z.string().optional(),
  range: z.string().optional(),
  /** `plus 7 (2d6) Fire damage` parts found in the text. */
  extraDamage: z.array(DamagePart).default([]),
});
export type Attack = z.infer<typeof Attack>;

export const SaveCall = z.object({
  ability: Ability,
  dc: z.number().int(),
  halfOnSuccess: z.boolean().optional(),
});
export type SaveCall = z.infer<typeof SaveCall>;

/** A non-attack `<attack>` triple (`Heal||1d10`) rendered as a plain roll button. */
export const RollButton = z.object({ label: z.string(), dice: DiceExpr });
export type RollButton = z.infer<typeof RollButton>;

export const Feature = z.object({
  name: z.string(),
  displayName: z.string(),
  text: z.string(),
  uses: Uses.optional(),
  recharge: Recharge.optional(),
  /** Legendary action cost when more than 1 (`(Costs 2 Actions)`). */
  cost: z.number().int().optional(),
  /** `variant`, `bonus-action` and similar markers. */
  tags: z.array(z.string()).default([]),
  attacks: z.array(Attack).default([]),
  rolls: z.array(RollButton).default([]),
  saves: z.array(SaveCall).default([]),
});
export type Feature = z.infer<typeof Feature>;

export const Size = z.enum(['T', 'S', 'M', 'L', 'H', 'G']);
export type Size = z.infer<typeof Size>;

export const Speeds = z.object({
  walk: z.number().int().optional(),
  fly: z.number().int().optional(),
  swim: z.number().int().optional(),
  climb: z.number().int().optional(),
  burrow: z.number().int().optional(),
  hover: z.boolean().optional(),
  notes: z.array(z.string()).default([]),
  raw: z.string(),
});
export type Speeds = z.infer<typeof Speeds>;

export const Modifier = z.object({
  category: z.string(),
  target: z.string(),
  value: z.number(),
  raw: z.string(),
});
export type Modifier = z.infer<typeof Modifier>;

export const Roll = z.object({
  dice: DiceExpr,
  description: z.string().optional(),
  level: z.number().int().optional(),
});
export type Roll = z.infer<typeof Roll>;

/** Unknown XML children, raw, keyed by element name (DATA-FORMATS.md §1). */
export const Extra = z.record(z.string(), z.array(z.string())).default({});

export const AbilityScores = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});
export type AbilityScores = z.infer<typeof AbilityScores>;

export const MonsterData = z.object({
  size: Size.nullable(),
  type: z.string(),
  subtype: z.string().optional(),
  alignment: z.string(),
  ac: z.object({ value: z.number().int(), note: z.string().optional() }).nullable(),
  hp: z.object({ average: z.number().int(), formula: DiceExpr.optional() }).nullable(),
  speeds: Speeds,
  abilities: AbilityScores,
  saves: z.partialRecord(Ability, z.number().int()),
  skills: z.record(z.string(), z.number().int()),
  proficiencyBonus: z.number().int().optional(),
  initiativeBonus: z.number().int().optional(),
  senses: z.string(),
  passivePerception: z.number().int().optional(),
  languages: z.string(),
  cr: z.string(),
  xp: z.number().int(),
  damageVulnerabilities: z.array(z.string()),
  damageResistances: z.array(z.string()),
  damageImmunities: z.array(z.string()),
  conditionImmunities: z.array(z.string()),
  environment: z.array(z.string()),
  isNpc: z.boolean(),
  ancestry: z.string().optional(),
  sortName: z.string().optional(),
  description: z.string().optional(),
  traits: z.array(Feature),
  actions: z.array(Feature),
  bonusActions: z.array(Feature),
  reactions: z.array(Feature),
  legendary: z.object({
    perTurn: z.number().int().optional(),
    header: z.string().optional(),
    actions: z.array(Feature),
  }),
  lair: z.array(Feature),
  spellcasting: z
    .object({ spells: z.array(z.string()), slots: z.array(z.number().int()).optional() })
    .optional(),
  extra: Extra,
});
export type MonsterData = z.infer<typeof MonsterData>;

export const SpellData = z.object({
  level: z.number().int().min(0).max(9),
  /** School code (`A`, `C`, `D`, `EN`, `EV`, `I`, `N`, `T`) or empty. */
  school: z.string(),
  ritual: z.boolean(),
  time: z.string(),
  range: z.string(),
  components: z.string(),
  duration: z.string(),
  classes: z.array(z.string()),
  text: z.string(),
  rolls: z.array(Roll).default([]),
  modifiers: z.array(Modifier).default([]),
  special: z.string().optional(),
  extra: Extra,
});
export type SpellData = z.infer<typeof SpellData>;

export const ItemData = z.object({
  typeCode: z.string(),
  magic: z.boolean(),
  detail: z.string().optional(),
  rarity: z.string().optional(),
  requiresAttunement: z.boolean().optional(),
  weight: z.number().optional(),
  value: z.number().optional(),
  ac: z.number().int().optional(),
  strength: z.number().int().optional(),
  stealthDisadvantage: z.boolean(),
  dmg1: DiceExpr.optional(),
  dmg2: DiceExpr.optional(),
  dmgType: z.string().optional(),
  properties: z.array(z.string()),
  range: z.string().optional(),
  text: z.string(),
  rolls: z.array(Roll).default([]),
  modifiers: z.array(Modifier).default([]),
  /** Equipment pack contents from `<container>` records (SRD file only). */
  contents: z.array(z.object({ name: z.string(), quantity: z.number().int() })).default([]),
  extra: Extra,
});
export type ItemData = z.infer<typeof ItemData>;

export const FeatData = z.object({
  prerequisite: z.string().optional(),
  text: z.string(),
  proficiency: z.string().optional(),
  special: z.string().optional(),
  rolls: z.array(Roll).default([]),
  modifiers: z.array(Modifier).default([]),
  extra: Extra,
});
export type FeatData = z.infer<typeof FeatData>;

export const SimpleTrait = z.object({
  name: z.string(),
  text: z.string(),
  category: z.string().optional(),
  rolls: z.array(Roll).default([]),
  modifiers: z.array(Modifier).default([]),
});
export type SimpleTrait = z.infer<typeof SimpleTrait>;

export const SpeciesData = z.object({
  size: z.string().optional(),
  speed: z.string().optional(),
  ability: z.string().optional(),
  proficiency: z.string().optional(),
  spellAbility: z.string().optional(),
  spells: z.array(z.string()).default([]),
  languages: z.string().optional(),
  weapons: z.string().optional(),
  tools: z.string().optional(),
  armor: z.string().optional(),
  resist: z.string().optional(),
  vulnerable: z.string().optional(),
  conditionResist: z.string().optional(),
  conditionImmune: z.string().optional(),
  speedOther: z.string().optional(),
  ancestry: z.string().optional(),
  traits: z.array(SimpleTrait),
  extra: Extra,
});
export type SpeciesData = z.infer<typeof SpeciesData>;

export const BackgroundData = z.object({
  proficiency: z.string().optional(),
  ancestry: z.string().optional(),
  traits: z.array(SimpleTrait),
  modifiers: z.array(Modifier).default([]),
  extra: Extra,
});
export type BackgroundData = z.infer<typeof BackgroundData>;

export const ClassFeature = z.object({
  name: z.string(),
  text: z.string(),
  optional: z.boolean(),
  special: z.string().optional(),
  rolls: z.array(Roll).default([]),
  modifiers: z.array(Modifier).default([]),
});
export type ClassFeature = z.infer<typeof ClassFeature>;

export const ClassLevel = z.object({
  level: z.number().int().min(1).max(20),
  scoreImprovement: z.boolean(),
  features: z.array(ClassFeature),
  slots: z.object({ values: z.array(z.number().int()), optional: z.boolean() }).optional(),
  counters: z.array(
    z.object({
      name: z.string(),
      value: z.number().int(),
      reset: z.string().optional(),
      subclass: z.string().optional(),
    }),
  ),
});
export type ClassLevel = z.infer<typeof ClassLevel>;

export const ClassData = z.object({
  hd: z.number().int().optional(),
  proficiency: z.string().optional(),
  numSkills: z.number().int().optional(),
  armor: z.string().optional(),
  weapons: z.string().optional(),
  tools: z.string().optional(),
  wealth: z.string().optional(),
  spellAbility: z.string().optional(),
  slotsReset: z.string().optional(),
  levels: z.array(ClassLevel),
  extra: Extra,
});
export type ClassData = z.infer<typeof ClassData>;

const RecordHeader = z.object({
  schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
  id: z.string().min(1),
  key: z.string(),
  name: z.string(),
  displayName: z.string(),
  sourceId: z.string().min(1),
  sourceBook: z.string().optional(),
  sourcePage: z.number().int().optional(),
  edition: Edition,
  tags: z.array(z.string()).default([]),
  basedOn: z.object({ recordId: z.string(), sourceId: z.string() }).optional(),
});

export const MonsterRecord = RecordHeader.extend({ kind: z.literal('monster'), data: MonsterData });
export const SpellRecord = RecordHeader.extend({ kind: z.literal('spell'), data: SpellData });
export const ItemRecord = RecordHeader.extend({ kind: z.literal('item'), data: ItemData });
export const FeatRecord = RecordHeader.extend({ kind: z.literal('feat'), data: FeatData });
export const SpeciesRecord = RecordHeader.extend({ kind: z.literal('species'), data: SpeciesData });
export const BackgroundRecord = RecordHeader.extend({
  kind: z.literal('background'),
  data: BackgroundData,
});
export const ClassRecord = RecordHeader.extend({ kind: z.literal('class'), data: ClassData });

export const CompendiumRecord = z.discriminatedUnion('kind', [
  MonsterRecord,
  SpellRecord,
  ItemRecord,
  FeatRecord,
  SpeciesRecord,
  BackgroundRecord,
  ClassRecord,
]);
export type CompendiumRecord = z.infer<typeof CompendiumRecord>;
export type MonsterRecord = z.infer<typeof MonsterRecord>;
export type SpellRecord = z.infer<typeof SpellRecord>;
export type ItemRecord = z.infer<typeof ItemRecord>;
export type FeatRecord = z.infer<typeof FeatRecord>;
export type SpeciesRecord = z.infer<typeof SpeciesRecord>;
export type BackgroundRecord = z.infer<typeof BackgroundRecord>;
export type ClassRecord = z.infer<typeof ClassRecord>;

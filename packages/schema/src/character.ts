import { z } from 'zod';
import { Ability, IsoDateTime, RecordKind } from './common';

/**
 * A player's character (docs/PLAYER-MODE.md, Part 3; ADR 0068): `Library/characters/<id>.json`.
 * Characters belong to the Library, not to a campaign; a joined campaign links one by id.
 *
 * Two kinds:
 * - **External**: the sheet is kept in another app. The file holds the table numbers the player
 *   enters, the numbers a GM's PC card takes, and a link to the sheet.
 * - **Trifold**: the sheet is here. Its table numbers are worked out from it
 *   (`@trifold/rules` character), each with an optional override.
 *
 * An External character can become a Trifold one, starting from its numbers; not the reverse.
 */
export const CHARACTER_SCHEMA_VERSION = 1;

const int = z.number().int();

/** The 18 skills, by key. Their abilities are in `@trifold/rules` (`SKILL_ABILITY`). */
export const Skill = z.enum([
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
]);
export type Skill = z.infer<typeof Skill>;

/** The rules a character is played under. */
export const CharacterEdition = z.enum(['2024', '2014']);
export type CharacterEdition = z.infer<typeof CharacterEdition>;

/**
 * A compendium record a sheet names, by kind, key and name: it still reads by name when the
 * record is gone (shared content after leaving a campaign, a removed file), and resolves again
 * when a record with the same kind and key comes back.
 */
export const SheetRef = z.object({
  kind: RecordKind,
  key: z.string().min(1),
  name: z.string().min(1),
});
export type SheetRef = z.infer<typeof SheetRef>;

/**
 * The numbers a GM's PC card takes from a character (PLAYER-MODE.md, Who owns what), field for
 * field, in the ranges the table accepts.
 */
export const TableNumbers = z.object({
  classText: z.string().max(80).default(''),
  level: int.min(1).max(20).default(1),
  maxHp: int.min(1).max(999).default(10),
  ac: int.min(0).max(40).default(10),
  initiativeBonus: int.min(-10).max(20).default(0),
  speed: int.min(0).max(200).default(30),
  passives: z
    .object({
      perception: int.min(1).max(40).default(10),
      insight: int.min(1).max(40).default(10),
      investigation: int.min(1).max(40).default(10),
    })
    .prefault({}),
  saves: z.partialRecord(Ability, int.min(-10).max(30)).default({}),
  spellSaveDc: int.min(1).max(40).optional(),
});
export type TableNumbers = z.infer<typeof TableNumbers>;

/** Numbers a Trifold sheet works out, each of which the player can override. */
export const DerivedKey = z.enum([
  'proficiencyBonus',
  'ac',
  'initiative',
  'speed',
  'passivePerception',
  'passiveInsight',
  'passiveInvestigation',
  'spellSaveDc',
  'spellAttack',
  'save.str',
  'save.dex',
  'save.con',
  'save.int',
  'save.wis',
  'save.cha',
  'skill.acrobatics',
  'skill.animalHandling',
  'skill.arcana',
  'skill.athletics',
  'skill.deception',
  'skill.history',
  'skill.insight',
  'skill.intimidation',
  'skill.investigation',
  'skill.medicine',
  'skill.nature',
  'skill.perception',
  'skill.performance',
  'skill.persuasion',
  'skill.religion',
  'skill.sleightOfHand',
  'skill.stealth',
  'skill.survival',
]);
export type DerivedKey = z.infer<typeof DerivedKey>;

const Id = z.string().min(1).max(64);

export const SheetClass = z.object({
  name: z.string().max(80).default(''),
  ref: SheetRef.optional(),
  subclass: z.string().max(80).default(''),
  level: int.min(1).max(20).default(1),
});
export type SheetClass = z.infer<typeof SheetClass>;

export const SheetAttack = z.object({
  id: Id,
  name: z.string().max(80).default(''),
  /** The ability the attack uses; `none` for a fixed bonus. */
  ability: z.union([Ability, z.literal('none')]).default('str'),
  proficient: z.boolean().default(true),
  /** A flat bonus on top, such as a magic weapon's. */
  bonus: int.min(-10).max(20).default(0),
  /** As written: `1d8 slashing`, `2d6+3 fire`. */
  damage: z.string().max(80).default(''),
  ref: SheetRef.optional(),
});
export type SheetAttack = z.infer<typeof SheetAttack>;

export const SheetFeature = z.object({
  id: Id,
  name: z.string().max(120).default(''),
  /** Where it comes from, as the player writes it: Fighter 2, Elf, Alert. */
  from: z.string().max(80).default(''),
  text: z.string().max(20_000).default(''),
  ref: SheetRef.optional(),
  /** Limited uses (ADR 0074): how many, how many are spent, and the rest that brings them back. */
  uses: z
    .object({
      max: int.min(1).max(99),
      used: int.min(0).max(99).default(0),
      reset: z.enum(['short', 'long']).default('long'),
    })
    .optional(),
});
export type SheetFeature = z.infer<typeof SheetFeature>;

export const SheetSpell = z.object({
  id: Id,
  name: z.string().max(120).default(''),
  level: int.min(0).max(9).default(0),
  prepared: z.boolean().default(false),
  ref: SheetRef.optional(),
});
export type SheetSpell = z.infer<typeof SheetSpell>;

export const SheetItem = z.object({
  id: Id,
  name: z.string().max(120).default(''),
  quantity: int.min(0).max(9999).default(1),
  ref: SheetRef.optional(),
});
export type SheetItem = z.infer<typeof SheetItem>;

/** What a Trifold character's sheet holds (PLAYER-MODE.md, Way 3). */
export const Sheet = z.object({
  species: z.string().max(80).default(''),
  speciesRef: SheetRef.optional(),
  background: z.string().max(80).default(''),
  backgroundRef: SheetRef.optional(),
  classes: z.array(SheetClass).max(13).default([]),
  abilities: z
    .object({
      str: int.min(1).max(30).default(10),
      dex: int.min(1).max(30).default(10),
      con: int.min(1).max(30).default(10),
      int: int.min(1).max(30).default(10),
      wis: int.min(1).max(30).default(10),
      cha: int.min(1).max(30).default(10),
    })
    .prefault({}),
  /** The saving throws the character is proficient in. */
  saves: z.array(Ability).default([]),
  skills: z.partialRecord(Skill, z.enum(['proficient', 'expertise'])).default({}),
  /** Armour, weapon and tool proficiencies and languages, as the player writes them. */
  otherProficiencies: z.string().max(2000).default(''),
  maxHp: int.min(1).max(999).default(10),
  armor: z
    .object({
      /** Light adds Dex, medium adds up to +2, heavy none; none is 10 + Dex. */
      kind: z.enum(['none', 'light', 'medium', 'heavy']).default('none'),
      /** The armour's base AC; unused with none. */
      base: int.min(0).max(30).default(11),
      shield: z.boolean().default(false),
      /** Magic armour, a ring, a fighting style. */
      bonus: int.min(-10).max(10).default(0),
    })
    .prefault({}),
  speed: int.min(0).max(200).default(30),
  spellcastingAbility: Ability.nullable().default(null),
  /** Spell slots by slot level, 1st first (docs/BUILDER.md); empty for none. */
  slots: z.array(int.min(0).max(9)).max(9).default([]),
  /** Resources (ADR 0074): slots spent, by slot level like `slots`. */
  slotsUsed: z.array(int.min(0).max(9)).max(9).optional(),
  /** The slots come back on a short rest too (Pact Magic). */
  slotsOnShortRest: z.boolean().optional(),
  /** Hit dice spent, by die size ("8" for d8). */
  hitDiceUsed: z.partialRecord(z.enum(['6', '8', '10', '12']), int.min(0).max(20)).optional(),
  /** Heroic Inspiration. */
  inspiration: z.boolean().optional(),
  attacks: z.array(SheetAttack).max(100).default([]),
  features: z.array(SheetFeature).max(300).default([]),
  spells: z.array(SheetSpell).max(500).default([]),
  equipment: z.array(SheetItem).max(500).default([]),
  /** Coins, as gold pieces (docs/BUILDER.md: an equipment option's gold goes here). */
  gp: z.number().min(0).max(10_000_000).default(0),
  /** Numbers the player set by hand over what the sheet works out. */
  overrides: z.partialRecord(DerivedKey, int.min(-20).max(99)).default({}),
});
export type Sheet = z.infer<typeof Sheet>;

/** A link the player opens their sheet from: a web address, never anything else. */
export const SheetUrl = z
  .string()
  .max(2000)
  .regex(/^https?:\/\/\S+$/i);

/**
 * The choices the guided builder made (docs/BUILDER.md), kept so Level up can follow them.
 * Records are named by kind, key and name. Editing the sheet by hand never needs it.
 */
export const CharacterBuild = z.object({
  edition: CharacterEdition,
  class: SheetRef,
  background: SheetRef,
  species: SheetRef,
  size: z.enum(['Small', 'Medium']).default('Medium'),
  abilityMethod: z.enum(['standard', 'pointBuy', 'rolled']),
  /** The scores before the background's increase. */
  baseScores: z.object({
    str: int.min(1).max(30),
    dex: int.min(1).max(30),
    con: int.min(1).max(30),
    int: int.min(1).max(30),
    wis: int.min(1).max(30),
    cha: int.min(1).max(30),
  }),
  increase: z.union([
    z.object({ plus2: Ability, plus1: Ability }),
    z.object({ all: z.array(Ability).length(3) }),
  ]),
  /** The class skills picked (the background's come with it). */
  classSkills: z.array(Skill).default([]),
  /** Hit points gained at each level after the first, in order. */
  hitPoints: z.array(int.min(1).max(30)).default([]),
  /** The subclass, once picked at its level. */
  subclass: SheetRef.optional(),
  /** Each ability score improvement or feat taken, by level ("+2 str", a feat's name). */
  improvements: z
    .array(z.object({ level: int.min(1).max(20), detail: z.string().max(120) }))
    .default([]),
});
export type CharacterBuild = z.infer<typeof CharacterBuild>;

export const Character = z.object({
  schemaVersion: z.literal(CHARACTER_SCHEMA_VERSION),
  id: z.string().regex(/^[0-9A-Za-z_-]{1,64}$/),
  name: z.string().min(1).max(80),
  kind: z.enum(['external', 'trifold']),
  edition: CharacterEdition.default('2024'),
  /** The character sheet link (Way 1); a Trifold character may carry one too. */
  sheetUrl: SheetUrl.optional(),
  /** An External character's table numbers, as entered. */
  numbers: TableNumbers.prefault({}),
  /** A Trifold character's sheet; absent on an External one. */
  sheet: Sheet.optional(),
  notes: z.string().max(50_000).default(''),
  /** What the guided builder chose (docs/BUILDER.md); absent on a character made by hand. */
  build: CharacterBuild.optional(),
  /**
   * Forms (docs/PLAYER-MODE.md, "My characters and Sheets"): creature stat blocks the player
   * pinned for a wild shape or another transformation, by kind, key and name. Reference only:
   * the character's HP and token are untouched.
   */
  forms: z.array(SheetRef).max(100).optional(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Character = z.infer<typeof Character>;

import type {
  Ability,
  Character,
  DerivedKey,
  Sheet,
  SheetAttack,
  Skill,
  TableNumbers,
} from '@trifold/schema';

/**
 * A Trifold character's numbers (docs/PLAYER-MODE.md, Way 3; ADR 0068): worked out from the
 * sheet by the rules both editions share, each overridable by the player. Pure functions: the
 * sheet screen, table numbers and sheet updates all read them.
 */

/** Which ability each skill uses. */
export const SKILL_ABILITY: Readonly<Record<Skill, Ability>> = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

/** Skill names as a sheet shows them. */
export const SKILL_NAMES: Readonly<Record<Skill, string>> = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
};

export const ABILITY_NAMES: Readonly<Record<Ability, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const ABILITIES: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** An ability score's modifier. */
export function scoreModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** The character's level: its class levels added up, at least 1, at most 20. */
export function characterLevel(sheet: Pick<Sheet, 'classes'>): number {
  const total = sheet.classes.reduce((n, c) => n + c.level, 0);
  return Math.min(20, Math.max(1, total));
}

/** The proficiency bonus at a character level: +2 at 1st, +6 at 17th. */
export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((Math.min(20, Math.max(1, level)) - 1) / 4);
}

/** One worked-out number: what the sheet gives, and what is shown when overridden. */
export interface Derived {
  value: number;
  /** What the sheet works out, before any override. */
  base: number;
  overridden: boolean;
}

export interface SheetNumbers {
  level: number;
  proficiencyBonus: Derived;
  modifiers: Record<Ability, number>;
  saves: Record<Ability, Derived>;
  skills: Record<Skill, Derived>;
  ac: Derived;
  initiative: Derived;
  speed: Derived;
  passivePerception: Derived;
  passiveInsight: Derived;
  passiveInvestigation: Derived;
  /** Null without a spellcasting ability, unless overridden. */
  spellSaveDc: Derived | null;
  spellAttack: Derived | null;
}

/** "Fighter 3 / Rogue 2", with a subclass in brackets: what a PC card's class line says. */
export function classLine(sheet: Pick<Sheet, 'classes'>): string {
  return sheet.classes
    .filter((c) => c.name.trim())
    .map((c) => `${c.name.trim()}${c.subclass.trim() ? ` (${c.subclass.trim()})` : ''} ${c.level}`)
    .join(' / ');
}

/**
 * Classes from a class line as `classLine` writes it ("Fighter (Champion) 3 / Rogue 2"). A line
 * that does not read that way, or whose levels do not add up to `level`, becomes one class with
 * the whole line as its name.
 */
export function parseClassLine(text: string, level: number): Sheet['classes'] {
  const parts = text
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  const classes = parts.map((p) => {
    const m = /^(.*?)(?:\s*\(([^)]*)\))?\s+(\d{1,2})$/.exec(p);
    return m ? { name: m[1]!.trim(), subclass: (m[2] ?? '').trim(), level: Number(m[3]) } : null;
  });
  const read = classes.every((c) => c && c.name && c.level >= 1 && c.level <= 20);
  if (parts.length && read && classes.reduce((n, c) => n + c!.level, 0) === level) {
    return classes as Sheet['classes'];
  }
  return [{ name: text.trim(), subclass: '', level }];
}

/** Every number a sheet works out, overrides applied. */
export function deriveSheet(sheet: Sheet): SheetNumbers {
  const o = sheet.overrides;
  const make = (key: DerivedKey, base: number): Derived => {
    const set = o[key];
    return set === undefined
      ? { value: base, base, overridden: false }
      : { value: set, base, overridden: true };
  };
  const level = characterLevel(sheet);
  const proficiencyBonus = make('proficiencyBonus', proficiencyForLevel(level));
  const pb = proficiencyBonus.value;
  const modifiers = Object.fromEntries(
    ABILITIES.map((a) => [a, scoreModifier(sheet.abilities[a])]),
  ) as Record<Ability, number>;

  const saves = Object.fromEntries(
    ABILITIES.map((a) => [a, make(`save.${a}`, modifiers[a] + (sheet.saves.includes(a) ? pb : 0))]),
  ) as Record<Ability, Derived>;

  const skills = Object.fromEntries(
    (Object.keys(SKILL_ABILITY) as Skill[]).map((s) => {
      const trained = sheet.skills[s];
      const extra = trained === 'expertise' ? pb * 2 : trained === 'proficient' ? pb : 0;
      return [s, make(`skill.${s}`, modifiers[SKILL_ABILITY[s]] + extra)];
    }),
  ) as Record<Skill, Derived>;

  const dex = modifiers.dex;
  const armor = sheet.armor;
  const armorAc =
    armor.kind === 'none'
      ? 10 + dex
      : armor.kind === 'light'
        ? armor.base + dex
        : armor.kind === 'medium'
          ? armor.base + Math.min(dex, 2)
          : armor.base;
  const ac = make('ac', armorAc + (armor.shield ? 2 : 0) + armor.bonus);

  const casting = sheet.spellcastingAbility;
  const castMod = casting ? modifiers[casting] : 0;
  const spellSaveDc =
    casting || o.spellSaveDc !== undefined ? make('spellSaveDc', 8 + pb + castMod) : null;
  const spellAttack =
    casting || o.spellAttack !== undefined ? make('spellAttack', pb + castMod) : null;

  return {
    level,
    proficiencyBonus,
    modifiers,
    saves,
    skills,
    ac,
    initiative: make('initiative', dex),
    speed: make('speed', sheet.speed),
    passivePerception: make('passivePerception', 10 + skills.perception.value),
    passiveInsight: make('passiveInsight', 10 + skills.insight.value),
    passiveInvestigation: make('passiveInvestigation', 10 + skills.investigation.value),
    spellSaveDc,
    spellAttack,
  };
}

/** An attack's bonus to hit on a sheet: ability, proficiency and its own bonus. */
export function attackBonus(attack: SheetAttack, numbers: SheetNumbers): number {
  const ability = attack.ability === 'none' ? 0 : numbers.modifiers[attack.ability];
  return ability + (attack.proficient ? numbers.proficiencyBonus.value : 0) + attack.bonus;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The numbers a GM's PC card takes from a character (PLAYER-MODE.md, Who owns what): an
 * External character's as entered, a Trifold one's worked out from its sheet, held to the
 * ranges the table accepts.
 */
export function tableNumbers(
  character: Pick<Character, 'kind' | 'numbers' | 'sheet'>,
): TableNumbers {
  const sheet = character.sheet;
  if (character.kind === 'external' || !sheet) return character.numbers;
  const n = deriveSheet(sheet);
  return {
    classText: classLine(sheet).slice(0, 80),
    level: n.level,
    maxHp: clamp(sheet.maxHp, 1, 999),
    ac: clamp(n.ac.value, 0, 40),
    initiativeBonus: clamp(n.initiative.value, -10, 20),
    speed: clamp(n.speed.value, 0, 200),
    passives: {
      perception: clamp(n.passivePerception.value, 1, 40),
      insight: clamp(n.passiveInsight.value, 1, 40),
      investigation: clamp(n.passiveInvestigation.value, 1, 40),
    },
    saves: Object.fromEntries(
      ABILITIES.map((a) => [a, clamp(n.saves[a].value, -10, 30)]),
    ) as TableNumbers['saves'],
    ...(n.spellSaveDc ? { spellSaveDc: clamp(n.spellSaveDc.value, 1, 40) } : {}),
  };
}

/**
 * A Trifold sheet to start an External character's switch from (ADR 0068): its class line and
 * level as one class, its max HP and speed, and every other number it entered kept as an
 * override, so nothing the table sees changes until the player fills the sheet in.
 */
export function sheetFromNumbers(numbers: TableNumbers): Sheet {
  const overrides: Sheet['overrides'] = {
    ac: numbers.ac,
    initiative: numbers.initiativeBonus,
    passivePerception: numbers.passives.perception,
    passiveInsight: numbers.passives.insight,
    passiveInvestigation: numbers.passives.investigation,
  };
  for (const a of ABILITIES) {
    const save = numbers.saves[a];
    if (save !== undefined) overrides[`save.${a}`] = save;
  }
  if (numbers.spellSaveDc !== undefined) overrides.spellSaveDc = numbers.spellSaveDc;
  return {
    species: '',
    background: '',
    classes: parseClassLine(numbers.classText, numbers.level),
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves: [],
    skills: {},
    otherProficiencies: '',
    maxHp: numbers.maxHp,
    armor: { kind: 'none', base: 11, shield: false, bonus: 0 },
    speed: numbers.speed,
    spellcastingAbility: null,
    attacks: [],
    features: [],
    spells: [],
    equipment: [],
    gp: 0,
    overrides,
  };
}

/** A blank sheet for a new Trifold character. */
export function blankSheet(): Sheet {
  return {
    ...sheetFromNumbers({
      classText: '',
      level: 1,
      maxHp: 10,
      ac: 10,
      initiativeBonus: 0,
      speed: 30,
      passives: { perception: 10, insight: 10, investigation: 10 },
      saves: {},
    }),
    overrides: {},
  };
}

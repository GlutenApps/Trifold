import type { Ability, CharacterBuild, Sheet, SheetRef, Skill } from '@trifold/schema';
import {
  hitPointsAtFirstLevel,
  withBackgroundIncrease,
  type BackgroundOption,
  type ClassOption,
  type SpeciesOption,
} from './build2024';
import { blankSheet, scoreModifier, SKILL_NAMES } from './derive';

/**
 * The guided builder's last step (docs/BUILDER.md): its choices made into a 1st-level sheet and
 * the build record Level up follows. Pure: the screens hold the choices, this writes the sheet.
 */

const ABILITY_BY_NAME: Readonly<Record<string, Ability>> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};

/** A skill's key from its name as the SRD writes it ("Sleight of Hand" → sleightOfHand). */
export function skillKey(name: string): Skill | null {
  const want = name.trim().toLowerCase();
  const hit = (Object.keys(SKILL_NAMES) as Skill[]).find(
    (k) => SKILL_NAMES[k].toLowerCase() === want,
  );
  return hit ?? null;
}

/**
 * The ability a caster casts with: the last ability its primary ability names ("Strength and
 * Charisma" → Charisma for a Paladin, "Wisdom" for a Cleric). Null for a class that casts none.
 */
export function spellcastingAbilityOf(
  option: Pick<ClassOption, 'casterType' | 'primaryAbility'>,
): Ability | null {
  if (option.casterType === 'NONE') return null;
  const named = option.primaryAbility
    .split(/,|\band\b|\bor\b/)
    .map((s) => ABILITY_BY_NAME[s.trim().toLowerCase()])
    .filter((a): a is Ability => !!a);
  return named.at(-1) ?? null;
}

export interface BuildChoices {
  edition: '2024';
  cls: ClassOption;
  classRef: SheetRef;
  background: BackgroundOption;
  backgroundRef: SheetRef;
  /** The background's feat's text, from its feat record when there is one. */
  featText?: string;
  species: SpeciesOption;
  speciesRef: SheetRef;
  size: 'Small' | 'Medium';
  abilityMethod: CharacterBuild['abilityMethod'];
  baseScores: Record<Ability, number>;
  increase: CharacterBuild['increase'];
  classSkills: Skill[];
  languages: string;
}

let nextId = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextId += 1)}`;

export function buildSheet2024(c: BuildChoices): { sheet: Sheet; build: CharacterBuild } {
  const abilities = withBackgroundIncrease(c.baseScores, c.increase);
  const skills: Sheet['skills'] = {};
  for (const name of c.background.skills) {
    const key = skillKey(name);
    if (key) skills[key] = 'proficient';
  }
  for (const key of c.classSkills) skills[key] = 'proficient';
  const proficiencies = [
    c.cls.armor && `Armor: ${c.cls.armor}`,
    c.cls.weapons && `Weapons: ${c.cls.weapons}`,
    c.cls.tools && `Tools: ${c.cls.tools}`,
    c.background.tool && `Tool (${c.background.name}): ${c.background.tool}`,
    c.languages.trim() && `Languages: ${c.languages.trim()}`,
  ].filter(Boolean);
  const sheet: Sheet = {
    ...blankSheet(),
    species: c.species.name,
    speciesRef: c.speciesRef,
    background: c.background.name,
    backgroundRef: c.backgroundRef,
    classes: [{ name: c.cls.name, ref: c.classRef, subclass: '', level: 1 }],
    abilities,
    saves: [...c.cls.saves],
    skills,
    otherProficiencies: proficiencies.join('\n'),
    maxHp: hitPointsAtFirstLevel(c.cls.hitDie, scoreModifier(abilities.con)),
    speed: c.species.speed,
    spellcastingAbility: spellcastingAbilityOf(c.cls),
    features: [
      ...c.cls.features(1).map((f) => ({
        id: id('feature'),
        name: f.name,
        from: `${c.cls.name} 1`,
        text: f.text,
      })),
      ...c.species.traits.map((t) => ({
        id: id('feature'),
        name: t.name,
        from: c.species.name,
        text: t.text,
      })),
      {
        id: id('feature'),
        name: c.background.feat,
        from: c.background.name,
        text: c.featText ?? '',
      },
    ],
  };
  const build: CharacterBuild = {
    edition: c.edition,
    class: c.classRef,
    background: c.backgroundRef,
    species: c.speciesRef,
    size: c.size,
    abilityMethod: c.abilityMethod,
    baseScores: { ...c.baseScores },
    increase: c.increase,
    classSkills: [...c.classSkills],
    hitPoints: [],
  };
  return { sheet, build };
}

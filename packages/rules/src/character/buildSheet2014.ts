import type { Ability, CharacterBuild, ItemRecord, Sheet, SheetRef, Skill } from '@trifold/schema';
import {
  castingAbility2014,
  equipmentChoices2014,
  equipmentItems2014,
  spellSlots2014,
  withRaceIncrease,
  type Race2014,
  type Subrace2014,
} from './build2014';
import {
  hitPointsAtFirstLevel,
  spellSlots,
  type BackgroundOption,
  type ClassOption,
} from './build2024';
import { skillKey } from './buildSheet';
import { blankSheet, scoreModifier } from './derive';
import { equipmentToSheet, optionItems, type EquipmentLine } from './equipment';
import type { SubclassOption } from './levelUp';

/**
 * The 2014 builder's last step (docs/BUILDER.md, phase 8): its choices made into a 1st-level
 * sheet and the build record Level up follows. The race raises the scores; the background gives
 * skills, equipment and its feature, no increase and no feat. Pure.
 */
export interface BuildChoices2014 {
  cls: ClassOption;
  classRef: SheetRef;
  /** A subclass chosen at 1st level (cleric, sorcerer, warlock). */
  subclass?: { option: SubclassOption; ref: SheetRef };
  race: Race2014;
  raceRef: SheetRef;
  subrace?: Subrace2014;
  subraceRef?: SheetRef;
  /** The +1s a race lets the player place (Half-Elf). */
  chosen: Ability[];
  /** An SRD 5.1 background, or a 2024 one used the 2014 way (its skills, tool and kit). */
  background: BackgroundOption;
  backgroundRef: SheetRef;
  abilityMethod: CharacterBuild['abilityMethod'];
  baseScores: Record<Ability, number>;
  classSkills: Skill[];
  languages: string;
  /** Which choice was taken on each of the class's equipment lines (0 for (a)). */
  classPicks: number[];
  /** The background's kit: an SRD 5.1 background's list, or a 2024 one's option picked. */
  backgroundKit?: string;
  items?: ReadonlyMap<string, ItemRecord>;
  /** Cantrips and spells picked; `prepared` false for a wizard's spellbook spells not prepared. */
  spells?: ReadonlyArray<{ ref: SheetRef; level: number; prepared?: boolean }>;
}

let nextId = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextId += 1)}`;

export function buildSheet2014(c: BuildChoices2014): { sheet: Sheet; build: CharacterBuild } {
  const abilities = withRaceIncrease(c.baseScores, c.race, c.subrace ?? null, c.chosen);
  const skills: Sheet['skills'] = {};
  for (const name of c.background.skills) {
    const key = skillKey(name);
    if (key) skills[key] = 'proficient';
  }
  for (const key of c.classSkills) skills[key] = 'proficient';

  // The class's lines, each its chosen option; then the background's kit.
  const lines: EquipmentLine[] = [];
  let gp = 0;
  (c.cls.equipmentLines ?? []).forEach((line, i) => {
    const choices = equipmentChoices2014(line);
    const got = equipmentItems2014(choices[Math.min(c.classPicks[i] ?? 0, choices.length - 1)]!);
    lines.push(...got.items);
    gp += got.gp;
  });
  const kit = c.backgroundKit ?? c.background.equipment[0] ?? '';
  if (kit) {
    const got = /^[A-Z]:\s/.test(kit) ? optionItems(kit) : equipmentItems2014(kit);
    lines.push(...got.items);
    gp += got.gp;
  }
  const gear = equipmentToSheet(lines, c.items ?? new Map(), abilities);

  const proficiencies = [
    c.cls.armor && `Armor: ${c.cls.armor}`,
    c.cls.weapons && `Weapons: ${c.cls.weapons}`,
    c.cls.tools && `Tools: ${c.cls.tools}`,
    c.background.tool && `Tool (${c.background.name}): ${c.background.tool}`,
    c.languages.trim() && `Languages: ${c.languages.trim()}`,
  ].filter(Boolean);
  const casting = castingAbility2014(c.cls.name);
  const feature = (name: string, from: string, text: string) => ({
    id: id('feature'),
    name,
    from,
    text,
  });

  const sheet: Sheet = {
    ...blankSheet(),
    species: c.subrace ? c.subrace.name : c.race.name,
    speciesRef: c.subraceRef ?? c.raceRef,
    background: c.background.name,
    backgroundRef: c.backgroundRef,
    classes: [
      {
        name: c.cls.name,
        ref: c.classRef,
        subclass: c.subclass?.option.name ?? '',
        level: 1,
      },
    ],
    abilities,
    saves: [...c.cls.saves],
    skills,
    otherProficiencies: proficiencies.join('\n'),
    maxHp: hitPointsAtFirstLevel(c.cls.hitDie, scoreModifier(abilities.con)),
    speed: c.race.speed,
    spellcastingAbility: casting,
    equipment: gear.equipment,
    slots: spellSlots2014(c.cls, 1, spellSlots(c.cls, 1)),
    ...(c.cls.casterType === 'PACT' ? { slotsOnShortRest: true } : {}),
    spells: (c.spells ?? []).map((s) => ({
      id: id('spell'),
      name: s.ref.name,
      level: s.level,
      prepared: s.level > 0 && s.prepared !== false,
      ref: s.ref,
    })),
    gp,
    attacks: gear.attacks,
    ...(gear.armor ? { armor: gear.armor } : {}),
    features: [
      ...c.cls.features(1).map((f) => feature(f.name, `${c.cls.name} 1`, f.text)),
      ...(c.subclass?.option.features(1) ?? []).map((f) =>
        feature(f.name, `${c.subclass!.option.name} 1`, f.text),
      ),
      ...c.race.traits.map((t) => feature(t.name, c.race.name, t.text)),
      ...(c.subrace?.traits ?? []).map((t) => feature(t.name, c.subrace!.name, t.text)),
      ...(c.background.features ?? []).map((f) => feature(f.name, c.background.name, f.text)),
    ],
  };
  const build: CharacterBuild = {
    edition: '2014',
    class: c.classRef,
    background: c.backgroundRef,
    species: c.raceRef,
    size: c.race.size,
    abilityMethod: c.abilityMethod,
    baseScores: { ...c.baseScores },
    race2014: { ...(c.subraceRef ? { subrace: c.subraceRef } : {}), chosen: [...c.chosen] },
    classSkills: [...c.classSkills],
    hitPoints: [],
    ...(c.subclass ? { subclass: c.subclass.ref } : {}),
    improvements: [],
  };
  return { sheet, build };
}

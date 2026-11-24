import type { Ability, CharacterBuild, ClassRecord, Sheet, SheetRef } from '@trifold/schema';
import { spellSlots, type ClassOption } from './build2024';

/**
 * Level up for a character the guided builder made (docs/BUILDER.md): one level in its class,
 * with the hit points gained, the new features, the subclass at its level, an ability score
 * improvement or a feat at ASI levels, and the spells picked; spell slots follow the class.
 * Pure: the screens gather the choices, this writes the sheet and the build record.
 */

export interface SubclassOption {
  key: string;
  name: string;
  /** The class it belongs to, by name. */
  of: string;
  features(level: number): Array<{ name: string; text: string }>;
}

/** A subclass record (a class record with `subclassOf`) as Level up reads it. */
export function readSubclass(record: ClassRecord): SubclassOption | null {
  const of = record.data.extra['subclassOf']?.[0];
  if (!of) return null;
  return {
    key: record.key,
    name: record.displayName,
    of,
    features: (level) =>
      (record.data.levels.find((l) => l.level === level)?.features ?? []).map((f) => ({
        name: f.name,
        text: f.text,
      })),
  };
}

/** An ability score improvement: +2 to one, or +1 to two; or a feat instead. */
export type Improvement =
  | { kind: 'plus2'; ability: Ability }
  | { kind: 'plus1'; abilities: [Ability, Ability] }
  | { kind: 'feat'; feat: SheetRef; text: string };

export interface LevelUpChoices {
  sheet: Sheet;
  build: CharacterBuild;
  cls: ClassOption;
  /** The subclass, picked at the class's subclass level (and kept after). */
  subclass?: { option: SubclassOption; ref: SheetRef };
  /** Hit points this level gives (fixed or rolled, Constitution included). */
  hitPoints: number;
  improvement?: Improvement;
  /** Cantrips and prepared spells added this level. */
  spells?: ReadonlyArray<{ ref: SheetRef; level: number }>;
}

/** Features a level lists that are not features to keep on a sheet: the choices made here. */
const CHOICE_FEATURE = /^(ability score improvement|.* subclass(es)?)$/i;

let nextId = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextId += 1)}`;

/** The class level a sheet made by the builder is at. */
export function builtLevel(sheet: Pick<Sheet, 'classes'>): number {
  return sheet.classes[0]?.level ?? 1;
}

export function levelUpSheet(c: LevelUpChoices): { sheet: Sheet; build: CharacterBuild } {
  const level = Math.min(20, builtLevel(c.sheet) + 1);
  const abilities = { ...c.sheet.abilities };
  const raise = (a: Ability, n: number) => (abilities[a] = Math.min(20, abilities[a] + n));
  const imp = c.improvement;
  if (imp?.kind === 'plus2') raise(imp.ability, 2);
  if (imp?.kind === 'plus1') imp.abilities.forEach((a) => raise(a, 1));

  const features = [...c.sheet.features];
  for (const f of c.cls.features(level)) {
    if (CHOICE_FEATURE.test(f.name)) continue;
    features.push({
      id: id('feature'),
      name: f.name,
      from: `${c.cls.name} ${level}`,
      text: f.text,
    });
  }
  if (c.subclass) {
    for (const f of c.subclass.option.features(level)) {
      features.push({
        id: id('feature'),
        name: f.name,
        from: `${c.subclass.option.name} ${level}`,
        text: f.text,
      });
    }
  }
  if (imp?.kind === 'feat') {
    features.push({
      id: id('feature'),
      name: imp.feat.name,
      from: `${c.cls.name} ${level}`,
      text: imp.text,
      ref: imp.feat,
    });
  }

  const first = c.sheet.classes[0];
  const classes: Sheet['classes'] = first
    ? [
        {
          ...first,
          level,
          ...(c.subclass ? { subclass: c.subclass.option.name } : {}),
        },
        ...c.sheet.classes.slice(1),
      ]
    : c.sheet.classes;

  const sheet: Sheet = {
    ...c.sheet,
    classes,
    abilities,
    maxHp: Math.min(999, c.sheet.maxHp + Math.max(1, c.hitPoints)),
    features,
    slots: spellSlots(c.cls, level),
    spells: [
      ...c.sheet.spells,
      ...(c.spells ?? []).map((s) => ({
        id: id('spell'),
        name: s.ref.name,
        level: s.level,
        prepared: s.level > 0,
        ref: s.ref,
      })),
    ],
  };
  const build: CharacterBuild = {
    ...c.build,
    ...(c.subclass ? { subclass: c.subclass.ref } : {}),
    hitPoints: [...c.build.hitPoints, Math.max(1, c.hitPoints)],
    improvements: [
      ...(c.build.improvements ?? []),
      ...(imp
        ? [
            {
              level,
              detail:
                imp.kind === 'feat'
                  ? imp.feat.name
                  : imp.kind === 'plus2'
                    ? `+2 ${imp.ability}`
                    : `+1 ${imp.abilities[0]}, +1 ${imp.abilities[1]}`,
            },
          ]
        : []),
    ],
  };
  return { sheet, build };
}

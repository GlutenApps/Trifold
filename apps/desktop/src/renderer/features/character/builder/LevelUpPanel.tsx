import { useState } from 'react';
import {
  ABILITY_NAMES,
  builtLevel,
  featCategory,
  fixedHitPointsPerLevel,
  levelUpSheet,
  maxSpellLevel,
  scoreModifier,
  spellCounts,
  type Improvement,
} from '@trifold/rules';
import type { Ability, Character, CharacterBuild, Sheet } from '@trifold/schema';
import { useBuilderOptions, type BuilderOptions } from './options';

/**
 * Level up (docs/BUILDER.md), on a character the guided builder made: one level in its class.
 * Hit points fixed or rolled, the new features listed, the subclass at its level, an ability
 * score improvement or a feat at ASI levels, and the new cantrips and prepared spells; spell
 * slots follow the class. Nothing changes until Level up is pressed.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function LevelUpPanel({
  character,
  onApply,
  onClose,
}: {
  character: Character;
  onApply(sheet: Sheet, build: CharacterBuild): void;
  onClose(): void;
}) {
  const { options, error } = useBuilderOptions();
  if (error) {
    return (
      <p className="small join-problem" role="alert">
        Level up could not read the SRD: {error}
      </p>
    );
  }
  if (!options) return <p className="muted small">Reading the SRD…</p>;
  return (
    <LevelUpBody character={character} options={options} onApply={onApply} onClose={onClose} />
  );
}

function LevelUpBody({
  character,
  options,
  onApply,
  onClose,
}: {
  character: Character;
  options: BuilderOptions;
  onApply(sheet: Sheet, build: CharacterBuild): void;
  onClose(): void;
}) {
  const sheet = character.sheet!;
  const build = character.build!;
  const cls = options.classes.find((c) => c.option.key === build.class.key);
  const level = builtLevel(sheet) + 1;
  const [hpMode, setHpMode] = useState<'fixed' | 'roll'>('fixed');
  const [rolled, setRolled] = useState<number | null>(null);
  const [subclassKey, setSubclassKey] = useState(build.subclass?.key ?? '');
  const [impKind, setImpKind] = useState<'plus2' | 'plus1' | 'feat'>('plus2');
  const [a1, setA1] = useState<Ability | ''>('');
  const [a2, setA2] = useState<Ability | ''>('');
  const [featKey, setFeatKey] = useState('');
  const [spellKeys, setSpellKeys] = useState<string[]>([]);

  if (!cls) {
    return (
      <div className="banner warn" role="alert">
        <span>
          Level up needs the {build.class.name} class from the bundled 2024 SRD, which this Library
          does not have switched on. Add the level by hand on the sheet.
        </span>
        <button type="button" className="btn small" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const option = cls.option;
  const con = scoreModifier(sheet.abilities.con);
  const fixed = fixedHitPointsPerLevel(option.hitDie, con);
  const hitPoints = hpMode === 'fixed' ? fixed : rolled === null ? null : Math.max(1, rolled + con);
  const atSubclass = option.subclassLevel === level;
  const subclasses = options.subclasses.filter((s) => s.option.of === option.name);
  const subclass =
    subclasses.find((s) => s.option.key === subclassKey) ??
    (build.subclass ? subclasses.find((s) => s.option.key === build.subclass!.key) : undefined);
  const atAsi = option.asiLevels.includes(level);
  const feats = options.feats.filter(
    (f) =>
      featCategory(f) !== 'epicBoon' &&
      featCategory(f) !== 'fightingStyle' &&
      !/ability score improvement/i.test(f.displayName),
  );
  const feat = feats.find((f) => f.key === featKey);
  const improvement: Improvement | null = !atAsi
    ? null
    : impKind === 'plus2'
      ? a1
        ? { kind: 'plus2', ability: a1 }
        : null
      : impKind === 'plus1'
        ? a1 && a2 && a1 !== a2
          ? { kind: 'plus1', abilities: [a1, a2] }
          : null
        : feat
          ? {
              kind: 'feat',
              feat: { kind: 'feat', key: feat.key, name: feat.displayName },
              text: feat.data.text,
            }
          : null;

  // New spells this level: the class table's counts now, less what the sheet already has.
  const now = spellCounts(option, level);
  const have = {
    cantrips: sheet.spells.filter((s) => s.level === 0).length,
    prepared: sheet.spells.filter((s) => s.level > 0).length,
  };
  const more = {
    cantrips: Math.max(0, now.cantrips - have.cantrips),
    prepared: Math.max(0, now.prepared - have.prepared),
  };
  const known = new Set(sheet.spells.map((s) => s.ref?.key ?? s.name.toLowerCase()));
  const top = maxSpellLevel(option, level);
  const classSpells = options.spells.filter(
    (s) =>
      (s.data.classes ?? []).includes(option.name) &&
      !known.has(s.key) &&
      (s.data.level === 0 ? more.cantrips > 0 : more.prepared > 0 && s.data.level <= top),
  );
  const newFeatures = [
    ...option
      .features(level)
      .filter((f) => !/^(ability score improvement|.* subclass(es)?)$/i.test(f.name)),
    ...(subclass ? subclass.option.features(level) : []),
  ];

  const ready =
    hitPoints !== null && (!atSubclass || !!subclass) && (!atAsi || !!improvement) && level <= 20;

  return (
    <section
      className="edit-source level-up"
      aria-label={`Level up to ${level}`}
      data-testid="level-up"
    >
      <div className="books-panel-head">
        <strong>
          Level up to {option.name} {level}
        </strong>
      </div>

      <fieldset className="builder-increase">
        <legend>Hit points</legend>
        <label className="field inline">
          <input
            type="radio"
            name="levelup-hp"
            checked={hpMode === 'fixed'}
            onChange={() => setHpMode('fixed')}
          />
          Fixed: {fixed}
        </label>
        <label className="field inline">
          <input
            type="radio"
            name="levelup-hp"
            checked={hpMode === 'roll'}
            onChange={() => setHpMode('roll')}
          />
          Roll d{option.hitDie} {con >= 0 ? `+ ${con}` : `− ${-con}`}
        </label>
        {hpMode === 'roll' && (
          <button
            type="button"
            className="btn small"
            onClick={() => setRolled(1 + Math.floor(Math.random() * option.hitDie))}
          >
            {rolled === null ? 'Roll' : `Rolled ${rolled}: roll again`}
          </button>
        )}
        {hitPoints !== null && (
          <span className="small" data-testid="levelup-hp">
            +{hitPoints} HP, {sheet.maxHp + hitPoints} in all
          </span>
        )}
      </fieldset>

      {newFeatures.length > 0 && (
        <p className="small">New features: {newFeatures.map((f) => f.name).join(', ')}</p>
      )}

      {atSubclass && (
        <label className="field">
          Subclass
          <select
            aria-label="Subclass"
            value={subclassKey}
            onChange={(e) => setSubclassKey(e.target.value)}
          >
            <option value="">Choose a subclass…</option>
            {subclasses.map((s) => (
              <option key={s.option.key} value={s.option.key}>
                {s.option.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {atAsi && (
        <fieldset className="builder-increase">
          <legend>Ability score improvement or a feat</legend>
          {(
            [
              ['plus2', '+2 to one ability'],
              ['plus1', '+1 to two abilities'],
              ['feat', 'A feat'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="field inline">
              <input
                type="radio"
                name="levelup-imp"
                checked={impKind === id}
                onChange={() => setImpKind(id)}
              />
              {label}
            </label>
          ))}
          {impKind !== 'feat' ? (
            <div className="row">
              <select
                aria-label="First ability"
                value={a1}
                onChange={(e) => setA1(e.target.value as Ability)}
              >
                <option value="">Ability…</option>
                {ABILITIES.map((a) => (
                  <option key={a} value={a} disabled={sheet.abilities[a] >= 20}>
                    {ABILITY_NAMES[a]} ({sheet.abilities[a]})
                  </option>
                ))}
              </select>
              {impKind === 'plus1' && (
                <select
                  aria-label="Second ability"
                  value={a2}
                  onChange={(e) => setA2(e.target.value as Ability)}
                >
                  <option value="">Ability…</option>
                  {ABILITIES.filter((a) => a !== a1).map((a) => (
                    <option key={a} value={a} disabled={sheet.abilities[a] >= 20}>
                      {ABILITY_NAMES[a]} ({sheet.abilities[a]})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <select aria-label="Feat" value={featKey} onChange={(e) => setFeatKey(e.target.value)}>
              <option value="">Choose a feat…</option>
              {feats.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.displayName}
                  {f.data.prerequisite ? ` (${f.data.prerequisite})` : ''}
                </option>
              ))}
            </select>
          )}
        </fieldset>
      )}

      {classSpells.length > 0 && (
        <fieldset className="builder-skills builder-spells">
          <legend>
            New spells: up to{' '}
            {more.cantrips ? `${more.cantrips} cantrip${more.cantrips === 1 ? '' : 's'}` : ''}
            {more.cantrips && more.prepared ? ' and ' : ''}
            {more.prepared ? `${more.prepared} prepared` : ''}
          </legend>
          {classSpells.map((s) => {
            const on = spellKeys.includes(s.key);
            const isCantrip = s.data.level === 0;
            const picked = spellKeys.filter((k) => {
              const r = options.spells.find((x) => x.key === k);
              return r && (r.data.level === 0) === isCantrip;
            }).length;
            const cap = isCantrip ? more.cantrips : more.prepared;
            return (
              <label key={s.key} className="field inline">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && picked >= cap}
                  onChange={(e) =>
                    setSpellKeys((keys) =>
                      e.target.checked ? [...keys, s.key] : keys.filter((k) => k !== s.key),
                    )
                  }
                />
                {s.displayName}
                <span className="muted small">{isCantrip ? ' cantrip' : ` ${s.data.level}`}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={!ready}
          onClick={() => {
            if (hitPoints === null) return;
            const out = levelUpSheet({
              sheet,
              build,
              cls: option,
              hitPoints,
              ...(subclass && (atSubclass || build.subclass) ? { subclass } : {}),
              ...(improvement ? { improvement } : {}),
              spells: spellKeys.flatMap((k) => {
                const r = options.spells.find((x) => x.key === k);
                return r
                  ? [
                      {
                        ref: { kind: 'spell' as const, key: r.key, name: r.displayName },
                        level: r.data.level,
                      },
                    ]
                  : [];
              }),
            });
            onApply(out.sheet, out.build);
          }}
        >
          Level up
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}

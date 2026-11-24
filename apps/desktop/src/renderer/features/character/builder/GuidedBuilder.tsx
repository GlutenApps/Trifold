import { useMemo, useState } from 'react';
import {
  ABILITY_NAMES,
  buildSheet2024,
  pointBuySpent,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  rollAbilityScore,
  scoreModifier,
  SKILL_NAMES,
  skillKey,
  STANDARD_ARRAY,
  withBackgroundIncrease,
} from '@trifold/rules';
import type { Ability, Character, CharacterBuild, Skill } from '@trifold/schema';
import { SheetView } from '../SheetView';
import { signed } from '../fields';
import { useBuilderOptions, type BuilderOptions } from './options';

/**
 * The guided builder (docs/BUILDER.md): a 2024-rules character by choosing, in the SRD's order:
 * class, origin, ability scores, then a review of the sheet it will write. Nothing is saved
 * before Finish. Equipment and spells are the next steps to come; until then they are added on
 * the sheet.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ALL_SKILLS = Object.keys(SKILL_NAMES) as Skill[];
type Step = 'class' | 'origin' | 'abilities' | 'review';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'class', label: '1 Class' },
  { id: 'origin', label: '2 Origin' },
  { id: 'abilities', label: '3 Ability scores' },
  { id: 'review', label: '4 Review' },
];
type Method = CharacterBuild['abilityMethod'];

const d6 = () => 1 + Math.floor(Math.random() * 6);
const abbr = (a: Ability) => a.toUpperCase();

export function GuidedBuilder({
  name,
  onCancel,
  onFinish,
}: {
  name: string;
  onCancel(): void;
  onFinish(sheet: Character['sheet'] & object, build: CharacterBuild): void;
}) {
  const { options, error } = useBuilderOptions();
  if (error) {
    return (
      <div className="banner error" role="alert">
        <span>The builder could not read the SRD: {error}</span>
        <button type="button" className="btn small" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }
  if (!options) return <p className="muted">Reading the SRD…</p>;
  if (options.classes.length === 0 || options.backgrounds.length === 0) {
    return (
      <div className="banner warn" role="alert">
        <span>
          The guided builder uses the bundled 2024 SRD, which is switched off or missing in this
          Library. Switch it on under Library › Compendium › Sources › Files, or start with a blank
          sheet.
        </span>
        <button type="button" className="btn small" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }
  return <BuilderSteps name={name} options={options} onCancel={onCancel} onFinish={onFinish} />;
}

function BuilderSteps({
  name,
  options,
  onCancel,
  onFinish,
}: {
  name: string;
  options: BuilderOptions;
  onCancel(): void;
  onFinish(sheet: Character['sheet'] & object, build: CharacterBuild): void;
}) {
  const [step, setStep] = useState<Step>('class');
  const [classKey, setClassKey] = useState('');
  const [classSkills, setClassSkills] = useState<Skill[]>([]);
  const [backgroundKey, setBackgroundKey] = useState('');
  const [speciesKey, setSpeciesKey] = useState('');
  const [size, setSize] = useState<'Small' | 'Medium'>('Medium');
  const [languages, setLanguages] = useState('Common');
  const [method, setMethod] = useState<Method>('standard');
  /** Array and rolled: which pool value (by index) each ability took. */
  const [assigned, setAssigned] = useState<Partial<Record<Ability, number>>>({});
  const [rolled, setRolled] = useState<Array<{ score: number; dice: number[] }> | null>(null);
  const [bought, setBought] = useState<Record<Ability, number>>({
    str: 8,
    dex: 8,
    con: 8,
    int: 8,
    wis: 8,
    cha: 8,
  });
  const [increaseMode, setIncreaseMode] = useState<'twoOne' | 'all'>('twoOne');
  const [plus2, setPlus2] = useState<Ability | ''>('');
  const [plus1, setPlus1] = useState<Ability | ''>('');

  const cls = options.classes.find((c) => c.option.key === classKey);
  const background = options.backgrounds.find((b) => b.option.key === backgroundKey);
  const species = options.species.find((s) => s.option.key === speciesKey);
  const pool = useMemo(
    () => (method === 'standard' ? [...STANDARD_ARRAY] : (rolled?.map((r) => r.score) ?? [])),
    [method, rolled],
  );

  const baseScores = useMemo((): Record<Ability, number> | null => {
    if (method === 'pointBuy') return bought;
    if (!ABILITIES.every((a) => assigned[a] !== undefined)) return null;
    return Object.fromEntries(ABILITIES.map((a) => [a, pool[assigned[a]!]!])) as Record<
      Ability,
      number
    >;
  }, [method, bought, assigned, pool]);
  const spent = pointBuySpent(ABILITIES.map((a) => bought[a])) ?? 0;

  const skillOptions =
    cls?.option.skills.from === 'any'
      ? ALL_SKILLS
      : (cls?.option.skills.from ?? []).map(skillKey).filter((k): k is Skill => !!k);
  const increase: CharacterBuild['increase'] | null = !background
    ? null
    : increaseMode === 'all'
      ? { all: [...background.option.abilities] }
      : plus2 && plus1 && plus2 !== plus1
        ? { plus2, plus1 }
        : null;

  const ready: Record<Step, boolean> = {
    class: !!cls && classSkills.length === cls.option.skills.choose,
    origin: !!background && !!species,
    abilities: !!baseScores && !!increase && (method !== 'pointBuy' || spent <= POINT_BUY_BUDGET),
    review: true,
  };
  const reachable = (s: Step) => {
    const order = STEPS.map((x) => x.id);
    return order.slice(0, order.indexOf(s)).every((x) => ready[x]);
  };

  const built =
    cls && background && species && baseScores && increase
      ? buildSheet2024({
          edition: '2024',
          cls: cls.option,
          classRef: cls.ref,
          background: background.option,
          backgroundRef: background.ref,
          featText:
            options.feats.find(
              (f) => f.displayName.toLowerCase() === background.option.featName.toLowerCase(),
            )?.data.text ?? '',
          species: species.option,
          speciesRef: species.ref,
          size,
          abilityMethod: method,
          baseScores,
          increase,
          classSkills,
          languages,
        })
      : null;

  const order = STEPS.map((x) => x.id);
  const next = order[order.indexOf(step) + 1];
  const prev = order[order.indexOf(step) - 1];

  return (
    <section className="guided-builder" data-testid="guided-builder" aria-label="Guided builder">
      <div className="row character-head">
        <h2 className="grow">Building {name}</h2>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="subtablist" role="tablist" aria-label="Builder steps">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className={`subtab${step === s.id ? ' active' : ''}`}
            aria-selected={step === s.id}
            disabled={!reachable(s.id)}
            onClick={() => setStep(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {step === 'class' && (
        <div className="builder-step" data-testid="builder-class">
          <p className="muted small">Your class decides your hit points, training and features.</p>
          <ul className="builder-choices" aria-label="Classes">
            {options.classes.map(({ option: c }) => (
              <li key={c.key}>
                <label className={`builder-choice${classKey === c.key ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-class"
                    checked={classKey === c.key}
                    onChange={() => {
                      setClassKey(c.key);
                      setClassSkills([]);
                    }}
                  />
                  <span>
                    <strong>{c.name}</strong>
                    <span className="muted small">
                      d{c.hitDie} · {c.primaryAbility} · saves{' '}
                      {c.saves.map((a) => ABILITY_NAMES[a]).join(', ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {cls && (
            <fieldset className="builder-skills">
              <legend>
                Choose {cls.option.skills.choose} skills ({classSkills.length} chosen)
              </legend>
              {skillOptions.map((k) => {
                const on = classSkills.includes(k);
                return (
                  <label key={k} className="field inline">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && classSkills.length >= cls.option.skills.choose}
                      onChange={(e) =>
                        setClassSkills((list) =>
                          e.target.checked ? [...list, k] : list.filter((x) => x !== k),
                        )
                      }
                    />
                    {SKILL_NAMES[k]}
                  </label>
                );
              })}
            </fieldset>
          )}
        </div>
      )}

      {step === 'origin' && (
        <div className="builder-step" data-testid="builder-origin">
          <h3>Background</h3>
          <ul className="builder-choices" aria-label="Backgrounds">
            {options.backgrounds.map(({ option: b }) => (
              <li key={b.key}>
                <label className={`builder-choice${backgroundKey === b.key ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-background"
                    checked={backgroundKey === b.key}
                    onChange={() => {
                      setBackgroundKey(b.key);
                      setPlus2('');
                      setPlus1('');
                    }}
                  />
                  <span>
                    <strong>{b.name}</strong>
                    <span className="muted small">
                      {b.abilities.map(abbr).join(', ')} · {b.feat} · {b.skills.join(', ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <h3>Species</h3>
          <ul className="builder-choices" aria-label="Species">
            {options.species.map(({ option: s }) => (
              <li key={s.key}>
                <label className={`builder-choice${speciesKey === s.key ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-species"
                    checked={speciesKey === s.key}
                    onChange={() => {
                      setSpeciesKey(s.key);
                      setSize(s.sizes.includes('Medium') ? 'Medium' : s.sizes[0]!);
                    }}
                  />
                  <span>
                    <strong>{s.name}</strong>
                    <span className="muted small">
                      {s.sizes.join(' or ')} · speed {s.speed} ·{' '}
                      {s.traits.map((t) => t.name).join(', ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {species && species.option.sizes.length > 1 && (
            <label className="field inline">
              Size
              <select
                aria-label="Size"
                value={size}
                onChange={(e) => setSize(e.target.value as 'Small' | 'Medium')}
              >
                {species.option.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Languages
            <input
              type="text"
              aria-label="Languages"
              className="wide-input"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
            />
          </label>
        </div>
      )}

      {step === 'abilities' && (
        <div className="builder-step" data-testid="builder-abilities">
          <fieldset className="row builder-methods">
            <legend className="sr-only">How to set ability scores</legend>
            {(
              [
                ['standard', 'Standard array'],
                ['pointBuy', 'Point buy'],
                ['rolled', 'Roll'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="field inline">
                <input
                  type="radio"
                  name="builder-method"
                  checked={method === id}
                  onChange={() => {
                    setMethod(id);
                    setAssigned({});
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {method === 'rolled' && (
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setRolled(ABILITIES.map(() => rollAbilityScore(d6)));
                  setAssigned({});
                }}
              >
                {rolled ? 'Roll again' : 'Roll six scores'}
              </button>
              {rolled && (
                <span className="muted small" data-testid="rolled-scores">
                  {rolled.map((r) => `${r.score} (${r.dice.join(', ')})`).join(' · ')}
                </span>
              )}
            </div>
          )}
          {method === 'pointBuy' && (
            <p className="small" role="status">
              {POINT_BUY_BUDGET - spent} of {POINT_BUY_BUDGET} points left
            </p>
          )}
          <ul className="builder-scores">
            {ABILITIES.map((a) => (
              <li key={a} className="row">
                <span className="grow">{ABILITY_NAMES[a]}</span>
                {method === 'pointBuy' ? (
                  <select
                    aria-label={ABILITY_NAMES[a]}
                    value={bought[a]}
                    onChange={(e) => setBought({ ...bought, [a]: Number(e.target.value) })}
                  >
                    {Object.keys(POINT_BUY_COST).map((v) => (
                      <option key={v} value={v}>
                        {v} ({POINT_BUY_COST[Number(v)]})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    aria-label={ABILITY_NAMES[a]}
                    value={assigned[a] ?? ''}
                    disabled={pool.length === 0}
                    onChange={(e) => {
                      const next = { ...assigned };
                      if (e.target.value === '') delete next[a];
                      else next[a] = Number(e.target.value);
                      setAssigned(next);
                    }}
                  >
                    <option value="">—</option>
                    {pool.map((v, i) => (
                      <option
                        key={i}
                        value={i}
                        disabled={ABILITIES.some((b) => b !== a && assigned[b] === i)}
                      >
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
          {background && (
            <fieldset className="builder-increase">
              <legend>
                {background.option.name} raises {background.option.abilities.map(abbr).join(', ')}
              </legend>
              <label className="field inline">
                <input
                  type="radio"
                  name="builder-increase"
                  checked={increaseMode === 'twoOne'}
                  onChange={() => setIncreaseMode('twoOne')}
                />
                +2 to one and +1 to another
              </label>
              <label className="field inline">
                <input
                  type="radio"
                  name="builder-increase"
                  checked={increaseMode === 'all'}
                  onChange={() => setIncreaseMode('all')}
                />
                +1 to all three
              </label>
              {increaseMode === 'twoOne' && (
                <div className="row">
                  <select
                    aria-label="Plus 2"
                    value={plus2}
                    onChange={(e) => setPlus2(e.target.value as Ability)}
                  >
                    <option value="">+2 to…</option>
                    {background.option.abilities.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_NAMES[a]}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Plus 1"
                    value={plus1}
                    onChange={(e) => setPlus1(e.target.value as Ability)}
                  >
                    <option value="">+1 to…</option>
                    {background.option.abilities
                      .filter((a) => a !== plus2)
                      .map((a) => (
                        <option key={a} value={a}>
                          {ABILITY_NAMES[a]}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </fieldset>
          )}
          {baseScores && increase && (
            <p className="small" data-testid="final-scores">
              {ABILITIES.map((a) => {
                const v = withBackgroundIncrease(baseScores, increase)[a];
                return `${abbr(a)} ${v} (${signed(scoreModifier(v))})`;
              }).join(' · ')}
            </p>
          )}
        </div>
      )}

      {step === 'review' && built && (
        <div className="builder-step" data-testid="builder-review">
          <p className="muted small">
            Your sheet as it will be. Equipment and spells are added on the sheet for now.
          </p>
          <SheetView
            character={{
              schemaVersion: 1,
              id: 'preview',
              name,
              kind: 'trifold',
              edition: '2024',
              numbers: {
                classText: '',
                level: 1,
                maxHp: 10,
                ac: 10,
                initiativeBonus: 0,
                speed: 30,
                passives: { perception: 10, insight: 10, investigation: 10 },
                saves: {},
              },
              sheet: built.sheet,
              notes: '',
              createdAt: '',
              updatedAt: '',
            }}
            onEdit={() => setStep('class')}
          />
        </div>
      )}

      <div className="row builder-nav">
        {prev && (
          <button type="button" className="btn" onClick={() => setStep(prev)}>
            Back
          </button>
        )}
        <span className="spacer" />
        {next ? (
          <button
            type="button"
            className="btn primary"
            disabled={!ready[step]}
            onClick={() => setStep(next)}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            disabled={!built}
            onClick={() => built && onFinish(built.sheet, built.build)}
          >
            Finish
          </button>
        )}
      </div>
    </section>
  );
}

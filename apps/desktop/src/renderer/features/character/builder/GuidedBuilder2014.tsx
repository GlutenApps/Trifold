import { useMemo, useState } from 'react';
import {
  ABILITY_NAMES,
  buildSheet2014,
  castingAbility2014,
  deriveSheet,
  equipmentChoices2014,
  pointBuySpent,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  rollAbilityScore,
  scoreModifier,
  SKILL_NAMES,
  skillKey,
  spellCounts2014,
  STANDARD_ARRAY,
  withRaceIncrease,
} from '@trifold/rules';
import type { Ability, Character, CharacterBuild, Skill } from '@trifold/schema';
import { SheetView } from '../SheetView';
import { signed } from '../fields';
import { useBuilderOptions, type BuilderOptions } from './options';

/**
 * The guided builder for the 2014 rules (docs/BUILDER.md, phase 8), from the bundled SRD 5.1:
 * class (and a subclass at 1st level for the classes that take one then), race and subrace,
 * background, ability scores with the race's increases, equipment line by line, spells known or
 * prepared, and a review. Nothing is saved before Finish.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ALL_SKILLS = Object.keys(SKILL_NAMES) as Skill[];
type Step = 'class' | 'race' | 'background' | 'abilities' | 'equipment' | 'spells' | 'review';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'class', label: 'Class' },
  { id: 'race', label: 'Race' },
  { id: 'background', label: 'Background' },
  { id: 'abilities', label: 'Ability scores' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'spells', label: 'Spells' },
  { id: 'review', label: 'Review' },
];
type Method = CharacterBuild['abilityMethod'];
const d6 = () => 1 + Math.floor(Math.random() * 6);
const abbr = (a: Ability) => a.toUpperCase();

export function GuidedBuilder2014({
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
  if (options.srd2014.classes.length === 0 || options.srd2014.races.length === 0) {
    return (
      <div className="banner warn" role="alert">
        <span>
          The 2014 builder uses the bundled SRD 5.1, which is switched off or missing in this
          Library. Switch it on under Library › Compendium, or start with a blank sheet.
        </span>
        <button type="button" className="btn small" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }
  return <Steps name={name} options={options} onCancel={onCancel} onFinish={onFinish} />;
}

function Steps({
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
  const o = options.srd2014;
  const [step, setStep] = useState<Step>('class');
  const [classKey, setClassKey] = useState('');
  const [subclassKey, setSubclassKey] = useState('');
  const [classSkills, setClassSkills] = useState<Skill[]>([]);
  const [raceKey, setRaceKey] = useState('');
  const [subraceKey, setSubraceKey] = useState('');
  const [chosen, setChosen] = useState<Ability[]>([]);
  const [languages, setLanguages] = useState('');
  /** A background by edition and key: the SRD 5.1 ones, or a 2024 one used the 2014 way. */
  const [backgroundKey, setBackgroundKey] = useState('');
  const [method, setMethod] = useState<Method>('standard');
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
  const [picks, setPicks] = useState<number[]>([]);
  const [backgroundKit, setBackgroundKit] = useState('');
  const [spellKeys, setSpellKeys] = useState<string[]>([]);
  const [spellFilter, setSpellFilter] = useState('');

  const cls = o.classes.find((c) => c.option.key === classKey);
  const subclasses = cls ? o.subclasses.filter((s) => s.option.of === cls.option.name) : [];
  const subclass = subclasses.find((s) => s.option.key === subclassKey);
  const needsSubclass = cls?.option.subclassLevel === 1 && subclasses.length > 0;
  const race = o.races.find((r) => r.option.key === raceKey);
  const subrace = race?.option.subraces.find((s) => s.key === subraceKey);
  const backgrounds = [
    ...options.legacyBackgrounds.map((b) => ({ ...b, id: `2014:${b.option.key}`, newer: false })),
    ...options.backgrounds.map((b) => ({ ...b, id: `2024:${b.option.key}`, newer: true })),
  ];
  const background = backgrounds.find((b) => b.id === backgroundKey);

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
  const scores =
    baseScores && race ? withRaceIncrease(baseScores, race.option, subrace ?? null, chosen) : null;

  const skillOptions =
    cls?.option.skills.from === 'any'
      ? ALL_SKILLS
      : (cls?.option.skills.from ?? []).map(skillKey).filter((k): k is Skill => !!k);
  const casting = cls ? castingAbility2014(cls.option.name) : null;
  const counts = cls
    ? spellCounts2014(cls.option, 1, casting && scores ? scores[casting] : 10)
    : { cantrips: 0, spells: 0, prepares: false, spellbook: 0 };
  const classSpells = cls
    ? o.spells.filter((s) => (s.data.classes ?? []).includes(cls.option.name) && s.data.level <= 1)
    : [];
  const spellPicks = counts.spellbook || counts.spells;
  const casts = counts.cantrips + spellPicks > 0 && classSpells.length > 0;
  const steps = STEPS.filter((s) => s.id !== 'spells' || casts);
  const order = steps.map((s) => s.id);
  const raiseable = race ? ABILITIES.filter((a) => !race.option.increase.fixed[a]) : [];

  const ready: Record<Step, boolean> = {
    class:
      !!cls && classSkills.length === cls.option.skills.choose && (!needsSubclass || !!subclass),
    race:
      !!race &&
      (race.option.subraces.length === 0 || !!subrace) &&
      chosen.length === race.option.increase.choose,
    background: !!background,
    abilities: !!baseScores && (method !== 'pointBuy' || spent <= POINT_BUY_BUDGET),
    equipment: true,
    spells: true,
    review: true,
  };
  const reachable = (s: Step) => order.slice(0, order.indexOf(s)).every((x) => ready[x]);

  const built =
    cls && race && background && baseScores
      ? buildSheet2014({
          cls: cls.option,
          classRef: cls.ref,
          ...(subclass && needsSubclass ? { subclass } : {}),
          race: race.option,
          raceRef: race.ref,
          ...(subrace
            ? {
                subrace,
                ...(race.subraceRefs.get(subrace.key)
                  ? { subraceRef: race.subraceRefs.get(subrace.key)! }
                  : {}),
              }
            : {}),
          chosen,
          background: background.option,
          backgroundRef: background.ref,
          abilityMethod: method,
          baseScores,
          classSkills,
          languages: languages || race.option.languages,
          classPicks: picks,
          ...(backgroundKit ? { backgroundKit } : {}),
          items: o.items,
          spells: spellKeys.flatMap((key, i) => {
            const r = o.spells.find((x) => x.key === key);
            if (!r) return [];
            // A wizard prepares as many of its spellbook's spells as the table allows.
            const spellIndex = spellKeys
              .slice(0, i)
              .filter((k) => (o.spells.find((x) => x.key === k)?.data.level ?? 0) > 0).length;
            return [
              {
                ref: { kind: 'spell' as const, key: r.key, name: r.displayName },
                level: r.data.level,
                ...(counts.spellbook && r.data.level > 0 && spellIndex >= counts.spells
                  ? { prepared: false }
                  : {}),
              },
            ];
          }),
        })
      : null;

  const next = order[order.indexOf(step) + 1];
  const prev = order[order.indexOf(step) - 1];

  return (
    <section className="guided-builder" data-testid="guided-builder" aria-label="Guided builder">
      <div className="row character-head">
        <h2 className="grow">
          Building {name} <span className="badge">2014 rules</span>
        </h2>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="subtablist" role="tablist" aria-label="Builder steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className={`subtab${step === s.id ? ' active' : ''}`}
            aria-selected={step === s.id}
            disabled={!reachable(s.id)}
            onClick={() => setStep(s.id)}
          >
            {i + 1} {s.label}
          </button>
        ))}
      </div>

      {step === 'class' && (
        <div className="builder-step" data-testid="builder-class">
          <ul className="builder-choices" aria-label="Classes">
            {o.classes.map(({ option: c }) => (
              <li key={c.key}>
                <label className={`builder-choice${classKey === c.key ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-class"
                    checked={classKey === c.key}
                    onChange={() => {
                      setClassKey(c.key);
                      setSubclassKey('');
                      setClassSkills([]);
                      setPicks([]);
                      setSpellKeys([]);
                    }}
                  />
                  <span>
                    <strong>{c.name}</strong>
                    <span className="muted small">
                      d{c.hitDie} · saves {c.saves.map((a) => ABILITY_NAMES[a]).join(', ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {cls && needsSubclass && (
            <label className="field">
              Subclass (chosen at 1st level)
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

      {step === 'race' && (
        <div className="builder-step" data-testid="builder-race">
          <ul className="builder-choices" aria-label="Races">
            {o.races.map(({ option: r }) => (
              <li key={r.key}>
                <label className={`builder-choice${raceKey === r.key ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-race"
                    checked={raceKey === r.key}
                    onChange={() => {
                      setRaceKey(r.key);
                      setSubraceKey(r.subraces[0]?.key ?? '');
                      setChosen([]);
                      setLanguages(r.languages);
                    }}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    <span className="muted small">
                      {Object.entries(r.increase.fixed)
                        .map(([a, n]) => `${abbr(a as Ability)} +${n}`)
                        .join(', ')}
                      {r.increase.choose ? ` · +1 to ${r.increase.choose} more` : ''} · {r.size} ·
                      speed {r.speed}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {race && race.option.subraces.length > 0 && (
            <fieldset className="builder-increase">
              <legend>Subrace</legend>
              {race.option.subraces.map((s) => (
                <label key={s.key} className="field inline">
                  <input
                    type="radio"
                    name="builder-subrace"
                    checked={subraceKey === s.key}
                    onChange={() => setSubraceKey(s.key)}
                  />
                  {s.name}
                  <span className="muted small">
                    {' '}
                    {Object.entries(s.increase.fixed)
                      .map(([a, n]) => `${abbr(a as Ability)} +${n}`)
                      .join(', ')}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {race && race.option.increase.choose > 0 && (
            <fieldset className="builder-increase">
              <legend>
                +1 to {race.option.increase.choose} abilities of your choice ({chosen.length}{' '}
                chosen)
              </legend>
              {raiseable.map((a) => {
                const on = chosen.includes(a);
                return (
                  <label key={a} className="field inline">
                    <input
                      type="checkbox"
                      aria-label={`Plus 1 to ${ABILITY_NAMES[a]}`}
                      checked={on}
                      disabled={!on && chosen.length >= race.option.increase.choose}
                      onChange={(e) =>
                        setChosen((list) =>
                          e.target.checked ? [...list, a] : list.filter((x) => x !== a),
                        )
                      }
                    />
                    {abbr(a)}
                  </label>
                );
              })}
            </fieldset>
          )}
          {race && (
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
          )}
        </div>
      )}

      {step === 'background' && (
        <div className="builder-step" data-testid="builder-background">
          <p className="muted small">
            A background gives skills, equipment and a feature. The 2024 backgrounds are offered the
            2014 way: their skills, tool and equipment, without their increase or feat.
          </p>
          <ul className="builder-choices" aria-label="Backgrounds">
            {backgrounds.map((b) => (
              <li key={b.id}>
                <label className={`builder-choice${backgroundKey === b.id ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-background"
                    checked={backgroundKey === b.id}
                    onChange={() => {
                      setBackgroundKey(b.id);
                      setBackgroundKit('');
                    }}
                  />
                  <span>
                    <strong>
                      {b.option.name}
                      {b.newer && (
                        <>
                          {' '}
                          <span className="badge">2024</span>
                        </>
                      )}
                    </strong>
                    <span className="muted small">{b.option.skills.join(', ')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
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
          {scores && (
            <p className="small" data-testid="final-scores">
              With {subrace?.name ?? race?.option.name}:{' '}
              {ABILITIES.map(
                (a) => `${abbr(a)} ${scores[a]} (${signed(scoreModifier(scores[a]))})`,
              ).join(' · ')}
            </p>
          )}
        </div>
      )}

      {step === 'equipment' && cls && background && (
        <div className="builder-step" data-testid="builder-equipment">
          <fieldset className="builder-kits">
            <legend>{cls.option.name}</legend>
            {(cls.option.equipmentLines ?? []).map((line, i) => {
              const choices = equipmentChoices2014(line);
              if (choices.length === 1) {
                return (
                  <p key={line} className="small">
                    {choices[0]}
                  </p>
                );
              }
              return (
                <div key={line} className="row wraps" role="radiogroup" aria-label={line}>
                  {choices.map((c, j) => (
                    <label key={c} className="field inline">
                      <input
                        type="radio"
                        name={`builder-line-${i}`}
                        checked={(picks[i] ?? 0) === j}
                        onChange={() =>
                          setPicks((list) => {
                            const out = [...list];
                            out[i] = j;
                            return out;
                          })
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              );
            })}
          </fieldset>
          <fieldset className="builder-kits">
            <legend>{background.option.name}</legend>
            {background.option.equipment.length > 1 ? (
              background.option.equipment.map((k, i) => (
                <label key={k} className="field inline builder-kit">
                  <input
                    type="radio"
                    name="builder-kit-background"
                    checked={(backgroundKit || background.option.equipment[0]) === k}
                    onChange={() => setBackgroundKit(k)}
                  />
                  <span>
                    <strong>Option {String.fromCharCode(65 + i)}</strong>{' '}
                    <span className="muted small">{k.replace(/^[A-Z]:\s*/, '')}</span>
                  </span>
                </label>
              ))
            ) : (
              <p className="small">{background.option.equipment[0] ?? 'No equipment listed.'}</p>
            )}
          </fieldset>
          {built && (
            <p className="small" data-testid="kit-summary">
              AC {deriveSheet(built.sheet).ac.value} · {built.sheet.attacks.length}{' '}
              {built.sheet.attacks.length === 1 ? 'attack' : 'attacks'} · {built.sheet.gp} GP
            </p>
          )}
        </div>
      )}

      {step === 'spells' && cls && (
        <div className="builder-step" data-testid="builder-spells">
          <p className="muted small">
            From the {cls.option.name} spell list.{' '}
            {counts.spellbook
              ? `Your spellbook holds ${counts.spellbook} 1st-level spells; you prepare ${counts.spells} of them, the first you pick.`
              : counts.prepares
                ? 'You prepare these from your class’s list, and can change them after a long rest.'
                : 'These are the spells you know.'}
          </p>
          <input
            type="search"
            aria-label="Filter spells"
            placeholder="Filter spells"
            className="wide-input"
            value={spellFilter}
            onChange={(e) => setSpellFilter(e.target.value)}
          />
          {(
            [
              [
                'cantrips',
                'Cantrips',
                counts.cantrips,
                classSpells.filter((s) => s.data.level === 0),
              ],
              [
                'spells',
                counts.spellbook
                  ? 'Spellbook'
                  : counts.prepares
                    ? 'Prepared spells'
                    : 'Spells known',
                spellPicks,
                classSpells.filter((s) => s.data.level === 1),
              ],
            ] as const
          )
            .filter(([, , n]) => n > 0)
            .map(([id, label, n, list]) => {
              const picked = list.filter((s) => spellKeys.includes(s.key)).length;
              const shown = list.filter((s) =>
                s.displayName.toLowerCase().includes(spellFilter.trim().toLowerCase()),
              );
              return (
                <fieldset key={id} className="builder-skills builder-spells">
                  <legend>
                    {label}: choose {n} ({picked} chosen)
                  </legend>
                  {shown.map((s) => {
                    const on = spellKeys.includes(s.key);
                    return (
                      <label key={s.key} className="field inline">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!on && picked >= n}
                          onChange={(e) =>
                            setSpellKeys((keys) =>
                              e.target.checked ? [...keys, s.key] : keys.filter((k) => k !== s.key),
                            )
                          }
                        />
                        {s.displayName}
                      </label>
                    );
                  })}
                </fieldset>
              );
            })}
        </div>
      )}

      {step === 'review' && built && (
        <div className="builder-step" data-testid="builder-review">
          <p className="muted small">Your sheet as it will be.</p>
          <SheetView
            character={{
              schemaVersion: 1,
              id: 'preview',
              name,
              kind: 'trifold',
              edition: '2014',
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

import { useMemo, useState } from 'react';
import {
  ABILITY_NAMES,
  buildSheet2024,
  featCategory,
  maxSpellLevel,
  spellCounts,
  deriveSheet,
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
type Step = 'class' | 'origin' | 'abilities' | 'equipment' | 'spells' | 'review';
/** The steps in order; Spells only for a class that casts at 1st level. */
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'class', label: 'Class' },
  { id: 'origin', label: 'Origin' },
  { id: 'abilities', label: 'Ability scores' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'spells', label: 'Spells' },
  { id: 'review', label: 'Review' },
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
  /** Legacy options (docs/BUILDER.md): SRD 5.1 backgrounds and species, used the 2024 way. */
  const [legacy, setLegacy] = useState(false);
  const [originFeatKey, setOriginFeatKey] = useState('');
  /** A legacy background's +1 to three abilities, picked from all six. */
  const [threeAbilities, setThreeAbilities] = useState<Ability[]>([]);
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
  /** The starting equipment options picked ("A: …"); option A until changed. */
  const [classKit, setClassKit] = useState('');
  const [backgroundKit, setBackgroundKit] = useState('');
  /** The cantrips and prepared spells picked, by record key. */
  const [spellKeys, setSpellKeys] = useState<string[]>([]);
  const [spellFilter, setSpellFilter] = useState('');

  const cls = options.classes.find((c) => c.option.key === classKey);
  // A key names its edition, since a 2014 and a 2024 background can share one.
  const pickKey = (o: { key: string; legacy?: boolean }) =>
    `${o.legacy ? '2014' : '2024'}:${o.key}`;
  const backgroundList = [...options.backgrounds, ...(legacy ? options.legacyBackgrounds : [])];
  const speciesList = [...options.species, ...(legacy ? options.legacySpecies : [])];
  const background = backgroundList.find((b) => pickKey(b.option) === backgroundKey);
  const originFeats = options.feats.filter((f) => featCategory(f) === 'origin');
  const originFeat = originFeats.find((f) => f.key === originFeatKey);
  /** The abilities the increase may go to: the background's three, or any for a legacy one. */
  const increaseAbilities = background?.option.legacy
    ? ABILITIES
    : (background?.option.abilities ?? []);
  // Casters pick cantrips and prepared spells at 1st level, from their class's list.
  const counts = cls ? spellCounts(cls.option, 1) : { cantrips: 0, prepared: 0 };
  const topLevel = cls ? maxSpellLevel(cls.option, 1) : 0;
  const classSpells = cls
    ? options.spells.filter(
        (s) =>
          (s.data.classes ?? []).includes(cls.option.name) &&
          (s.data.level === 0 ? counts.cantrips > 0 : s.data.level <= topLevel),
      )
    : [];
  const casts = counts.cantrips + counts.prepared > 0 && classSpells.length > 0;
  const steps = STEPS.filter((x) => x.id !== 'spells' || casts);
  const order = steps.map((x) => x.id);
  const species = speciesList.find((s) => pickKey(s.option) === speciesKey);
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
      ? background.option.legacy
        ? threeAbilities.length === 3
          ? { all: [...threeAbilities] }
          : null
        : { all: [...background.option.abilities] }
      : plus2 && plus1 && plus2 !== plus1
        ? { plus2, plus1 }
        : null;

  const ready: Record<Step, boolean> = {
    class: !!cls && classSkills.length === cls.option.skills.choose,
    origin: !!background && !!species && (!background.option.legacy || !!originFeat),
    abilities: !!baseScores && !!increase && (method !== 'pointBuy' || spent <= POINT_BUY_BUDGET),
    equipment: true,
    spells: true,
    review: true,
  };
  const reachable = (s: Step) => order.slice(0, order.indexOf(s)).every((x) => ready[x]);

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
          ...(background.option.legacy && originFeat
            ? {
                originFeat: {
                  ref: { kind: 'feat' as const, key: originFeat.key, name: originFeat.displayName },
                  text: originFeat.data.text,
                },
              }
            : {}),
          size,
          abilityMethod: method,
          baseScores,
          increase,
          classSkills,
          languages,
          classEquipment: classKit || cls.option.equipment[0] || '',
          backgroundEquipment: backgroundKit || background.option.equipment[0] || '',
          items: options.items,
          spells: spellKeys.flatMap((key) => {
            const r = options.spells.find((x) => x.key === key);
            return r
              ? [
                  {
                    ref: { kind: 'spell' as const, key: r.key, name: r.displayName },
                    level: r.data.level,
                  },
                ]
              : [];
          }),
        })
      : null;

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
                      setSpellKeys([]);
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
          {(options.legacyBackgrounds.length > 0 || options.legacySpecies.length > 0) && (
            <label className="field inline">
              <input
                type="checkbox"
                checked={legacy}
                onChange={(e) => {
                  setLegacy(e.target.checked);
                  if (!e.target.checked) {
                    if (backgroundKey.startsWith('2014:')) setBackgroundKey('');
                    if (speciesKey.startsWith('2014:')) setSpeciesKey('');
                  }
                }}
              />
              Include legacy (2014) backgrounds and species, used the 2024 way
            </label>
          )}
          <h3>Background</h3>
          <ul className="builder-choices" aria-label="Backgrounds">
            {backgroundList.map(({ option: b }) => (
              <li key={pickKey(b)}>
                <label className={`builder-choice${backgroundKey === pickKey(b) ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-background"
                    checked={backgroundKey === pickKey(b)}
                    onChange={() => {
                      setBackgroundKey(pickKey(b));
                      setPlus2('');
                      setPlus1('');
                      setThreeAbilities([]);
                    }}
                  />
                  <span>
                    <strong>
                      {b.name}
                      {b.legacy && (
                        <>
                          {' '}
                          <span className="badge">legacy</span>
                        </>
                      )}
                    </strong>
                    <span className="muted small">
                      {b.legacy
                        ? `Any three abilities · an origin feat · ${b.skills.join(', ')}`
                        : `${b.abilities.map(abbr).join(', ')} · ${b.feat} · ${b.skills.join(', ')}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {background?.option.legacy && (
            <label className="field">
              Origin feat
              <select
                aria-label="Origin feat"
                value={originFeatKey}
                onChange={(e) => setOriginFeatKey(e.target.value)}
              >
                <option value="">Choose an origin feat…</option>
                {originFeats.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h3>Species</h3>
          <ul className="builder-choices" aria-label="Species">
            {speciesList.map(({ option: s }) => (
              <li key={pickKey(s)}>
                <label className={`builder-choice${speciesKey === pickKey(s) ? ' on' : ''}`}>
                  <input
                    type="radio"
                    name="builder-species"
                    checked={speciesKey === pickKey(s)}
                    onChange={() => {
                      setSpeciesKey(pickKey(s));
                      setSize(s.sizes.includes('Medium') ? 'Medium' : s.sizes[0]!);
                    }}
                  />
                  <span>
                    <strong>
                      {s.name}
                      {s.legacy && (
                        <>
                          {' '}
                          <span className="badge">legacy</span>
                        </>
                      )}
                    </strong>
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
                {background.option.legacy
                  ? `${background.option.name} raises any abilities`
                  : `${background.option.name} raises ${background.option.abilities.map(abbr).join(', ')}`}
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
              {increaseMode === 'all' && background.option.legacy && (
                <div className="row">
                  {ABILITIES.map((a) => {
                    const on = threeAbilities.includes(a);
                    return (
                      <label key={a} className="field inline">
                        <input
                          type="checkbox"
                          aria-label={`Plus 1 to ${ABILITY_NAMES[a]}`}
                          checked={on}
                          disabled={!on && threeAbilities.length >= 3}
                          onChange={(e) =>
                            setThreeAbilities((list) =>
                              e.target.checked ? [...list, a] : list.filter((x) => x !== a),
                            )
                          }
                        />
                        {abbr(a)}
                      </label>
                    );
                  })}
                </div>
              )}
              {increaseMode === 'twoOne' && (
                <div className="row">
                  <select
                    aria-label="Plus 2"
                    value={plus2}
                    onChange={(e) => setPlus2(e.target.value as Ability)}
                  >
                    <option value="">+2 to…</option>
                    {increaseAbilities.map((a) => (
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
                    {increaseAbilities
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

      {step === 'equipment' && cls && background && (
        <div className="builder-step" data-testid="builder-equipment">
          <p className="muted small">
            Your class and your background each give a choice of starting equipment, or its worth in
            gold. Armour and weapons set your AC and attacks.
          </p>
          {(
            [
              ['class', cls.option.name, cls.option.equipment, classKit, setClassKit],
              [
                'background',
                background.option.name,
                background.option.equipment,
                backgroundKit,
                setBackgroundKit,
              ],
            ] as const
          ).map(([kind, label, kits, picked, setPicked]) => (
            <fieldset key={kind} className="builder-kits">
              <legend>{label}</legend>
              {kits.length === 0 ? (
                <p className="muted small">No starting equipment listed.</p>
              ) : (
                kits.map((k, i) => (
                  <label key={k} className="field inline builder-kit">
                    <input
                      type="radio"
                      name={`builder-kit-${kind}`}
                      checked={(picked || kits[0]) === k}
                      onChange={() => setPicked(k)}
                    />
                    <span>
                      <strong>Option {String.fromCharCode(65 + i)}</strong>{' '}
                      <span className="muted small">{k.replace(/^[A-Z]:\s*/, '')}</span>
                    </span>
                  </label>
                ))
              )}
            </fieldset>
          ))}
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
            From the {cls.option.name} spell list. You can change them later on the sheet.
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
                'prepared',
                'Prepared spells',
                counts.prepared,
                classSpells.filter((s) => s.data.level > 0),
              ],
            ] as const
          )
            .filter(([, , n]) => n > 0)
            .map(([id, label, n, list]) => {
              const picked = list.filter((s) => spellKeys.includes(s.key)).length;
              const shownList = list.filter((s) =>
                s.displayName.toLowerCase().includes(spellFilter.trim().toLowerCase()),
              );
              return (
                <fieldset key={id} className="builder-skills builder-spells">
                  <legend>
                    {label}: choose {n} ({picked} chosen)
                  </legend>
                  {shownList.map((s) => {
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

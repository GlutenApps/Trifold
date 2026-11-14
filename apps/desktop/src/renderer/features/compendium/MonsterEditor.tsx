import { useEffect, useRef, useState } from 'react';
import {
  abilityModifier,
  average,
  formatModifierPairs,
  isDiceExpression,
  parseModifierPairs,
  proficiencyBonusForCr,
  xpForCr,
  CR_ORDER,
} from '@trifold/rules';
import type { Feature, MonsterRecord } from '@trifold/schema';
import { Icon } from '../shell/icons';
import { CrScalePanel } from './CrScalePanel';
import {
  Check,
  EditorHead,
  ListField,
  moved,
  NumberField,
  RowActions,
  Section,
  SelectField,
  TextBlock,
  TextField,
} from './editorParts';

type Data = MonsterRecord['data'];
type FeatureList = 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'lair';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};
const SIZES: Array<readonly [string, string]> = [
  ['', '—'],
  ['T', 'Tiny'],
  ['S', 'Small'],
  ['M', 'Medium'],
  ['L', 'Large'],
  ['H', 'Huge'],
  ['G', 'Gargantuan'],
];
const SPEEDS = [
  ['walk', 'Walk'],
  ['fly', 'Fly'],
  ['swim', 'Swim'],
  ['climb', 'Climb'],
  ['burrow', 'Burrow'],
] as const;

function blankFeature(): Feature {
  return { name: '', displayName: '', text: '', tags: [], attacks: [], rolls: [], saves: [] };
}

function FeatureListEditor({
  label,
  features,
  onChange,
}: {
  label: string;
  features: Feature[];
  onChange(features: Feature[]): void;
}) {
  const update = (i: number, patch: Partial<Feature>) =>
    onChange(features.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const singular = label.toLowerCase().replace(/s$/, '');
  const nameOf = (f: Feature, i: number) => f.name.trim() || `${singular} ${i + 1}`;
  return (
    <section className="editor-section" aria-label={label}>
      <h3>{label}</h3>
      {features.map((f, i) => (
        <div key={i} className="feature-edit">
          <div className="row">
            <input
              type="text"
              className="grow"
              aria-label={`${label} name`}
              placeholder="Name, e.g. Bite or Fire Breath (Recharge 5–6)"
              value={f.name}
              onChange={(e) => update(i, { name: e.target.value, displayName: e.target.value })}
            />
            <RowActions
              name={nameOf(f, i)}
              index={i}
              count={features.length}
              onMove={(step) => onChange(moved(features, i, step))}
              onRemove={() => onChange(features.filter((_, j) => j !== i))}
            />
          </div>
          <textarea
            aria-label={`${label} text`}
            rows={3}
            placeholder="Text. Attack rolls, damage and saving throws are read from it."
            value={f.text}
            onChange={(e) => update(i, { text: e.target.value })}
          />
        </div>
      ))}
      <button type="button" className="btn" onClick={() => onChange([...features, blankFeature()])}>
        <Icon name="plus" />
        Add {singular}
      </button>
    </section>
  );
}

/** Monster editor for homebrew records (DESIGN.md §6.2), in sections (ADR 0027). */
export function MonsterEditor({
  record,
  onSave,
  onCancel,
  saving,
  isNew = false,
}: {
  record: MonsterRecord;
  onSave(record: MonsterRecord): void;
  onCancel(): void;
  saving: boolean;
  /** A blank monster from New homebrew, not yet saved. */
  isNew?: boolean;
}) {
  const [latest, setLatest] = useState<MonsterRecord>(record);
  return (
    <form
      className="record-editor monster-editor"
      data-testid="monster-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(latest);
      }}
    >
      <EditorHead
        title={`${isNew ? 'New' : 'Edit'} homebrew monster`}
        saving={saving}
        canSave={!!latest.displayName.trim()}
        onCancel={onCancel}
      />
      <MonsterFields record={record} onChange={setLatest} />
    </form>
  );
}

/**
 * The monster editor's sections without a form of their own, so the NPC form can hold them
 * (ADR 0039). `onChange` hands back the whole record as it would be saved: once on mount with
 * `dirty` false, then on every edit.
 */
export function MonsterFields({
  record,
  onChange,
  nameLabel = 'Name',
}: {
  record: MonsterRecord;
  onChange(record: MonsterRecord, dirty: boolean): void;
  nameLabel?: string;
}) {
  const [name, setName] = useState(record.displayName);
  const [d, setD] = useState<Data>(record.data);
  const [savesText, setSavesText] = useState(
    formatModifierPairs(d.saves as Record<string, number>),
  );
  const [skillsText, setSkillsText] = useState(formatModifierPairs(d.skills));
  const patch = (p: Partial<Data>) => setD((x) => ({ ...x, ...p }));
  const [start] = useState(() => ({ savesText, skillsText }));
  const report = useRef(onChange);
  report.current = onChange;
  const setFeatures = (key: FeatureList, features: Feature[]) =>
    patch({ [key]: features } as Partial<Data>);

  const setCr = (cr: string) => {
    // A CR typed by hand keeps the Scaled tag honest (ADR 0038).
    const scaled = d.scaled && d.scaled.fromCr !== cr ? { ...d.scaled, toCr: cr } : undefined;
    patch({
      cr,
      scaled,
      xp: xpForCr(cr) ?? d.xp,
      proficiencyBonus: proficiencyBonusForCr(cr) ?? d.proficiencyBonus,
    });
  };

  // The record as Save would write it, handed up after each change.
  useEffect(() => {
    const skills = parseModifierPairs(skillsText);
    const wis = abilityModifier(d.abilities.wis);
    report.current(
      {
        ...record,
        displayName: name,
        name,
        data: {
          ...d,
          saves: parseModifierPairs(savesText) as Data['saves'],
          skills,
          passivePerception: 10 + (skills['perception'] ?? wis),
        },
      },
      name !== record.displayName ||
        d !== record.data ||
        savesText !== start.savesText ||
        skillsText !== start.skillsText,
    );
  }, [record, start, name, d, savesText, skillsText]);

  const crOptions: Array<readonly [string, string]> = [
    ...(CR_ORDER.includes(d.cr as (typeof CR_ORDER)[number]) ? [] : [[d.cr, d.cr || '—'] as const]),
    ...CR_ORDER.map((cr) => [cr, cr] as const),
  ];

  return (
    <>
      <Section
        title="Basics"
        cols={4}
        checks={
          <Check label="Named character" checked={d.isNpc} onChange={(isNpc) => patch({ isNpc })} />
        }
      >
        <TextField label={nameLabel} value={name} onChange={setName} span={2} required />
        <SelectField
          label="Size"
          value={d.size ?? ''}
          options={SIZES}
          onChange={(v) => patch({ size: (v || null) as Data['size'] })}
        />
        <TextField
          label="Alignment"
          value={d.alignment}
          onChange={(alignment) => patch({ alignment })}
        />
        <TextField
          label="Type"
          value={d.type}
          placeholder="e.g. Aberration"
          onChange={(type) => patch({ type })}
        />
        <TextField
          label="Subtype"
          value={d.subtype}
          onChange={(v) => patch({ subtype: v || undefined })}
        />
      </Section>

      <Section
        title="Challenge"
        cols={3}
        hint="Or set the CR by hand: this changes only the CR, its XP and proficiency bonus."
        lead={
          <CrScalePanel
            // A new CR (applied, or set by hand) starts the scaler afresh from it.
            key={d.cr}
            data={{
              ...d,
              saves: parseModifierPairs(savesText) as Data['saves'],
              skills: parseModifierPairs(skillsText),
            }}
            name={name || 'creature'}
            onApply={(next) => {
              setD(next);
              setSavesText(formatModifierPairs(next.saves as Record<string, number>));
              setSkillsText(formatModifierPairs(next.skills));
            }}
          />
        }
      >
        <SelectField
          label="CR"
          ariaLabel="Challenge rating"
          value={d.cr}
          options={crOptions}
          onChange={setCr}
        />
        <NumberField label="XP" value={d.xp} onChange={(xp) => patch({ xp: xp ?? 0 })} />
        <NumberField
          label="Proficiency bonus"
          value={d.proficiencyBonus}
          onChange={(proficiencyBonus) => patch({ proficiencyBonus })}
        />
      </Section>

      <Section title="Armor class and hit points" cols={4}>
        <NumberField
          label="AC"
          ariaLabel="Armor class"
          value={d.ac?.value ?? 10}
          onChange={(v) => patch({ ac: { ...(d.ac ?? {}), value: v ?? 0 } })}
        />
        <TextField
          label="AC note"
          value={d.ac?.note}
          placeholder="e.g. natural armor"
          onChange={(v) => patch({ ac: { value: d.ac?.value ?? 10, ...(v ? { note: v } : {}) } })}
        />
        <NumberField
          label="HP average"
          ariaLabel="Hit points"
          value={d.hp?.average ?? 1}
          onChange={(v) => patch({ hp: { ...(d.hp ?? {}), average: v ?? 0 } })}
        />
        <label className="field">
          HP formula
          <span className="row field-with-action">
            <input
              type="text"
              aria-label="Hit point formula"
              placeholder="e.g. 4d8+4"
              value={d.hp?.formula ?? ''}
              onChange={(e) =>
                patch({
                  hp: {
                    average: d.hp?.average ?? 1,
                    ...(e.target.value ? { formula: e.target.value } : {}),
                  },
                })
              }
            />
            <button
              type="button"
              className="btn"
              disabled={!d.hp?.formula || !isDiceExpression(d.hp.formula)}
              title="Set the average from the formula"
              onClick={() =>
                d.hp?.formula &&
                patch({ hp: { ...d.hp, average: Math.floor(average(d.hp.formula)) } })
              }
            >
              Average
            </button>
          </span>
        </label>
      </Section>

      <Section title="Speed (feet)" cols={5}>
        {SPEEDS.map(([key, label]) => (
          <NumberField
            key={key}
            label={label}
            ariaLabel={`Speed ${key}`}
            min={0}
            value={d.speeds[key]}
            onChange={(v) => patch({ speeds: { ...d.speeds, [key]: v } })}
          />
        ))}
      </Section>

      <Section title="Ability scores" cols={6}>
        {ABILITIES.map((a) => {
          const mod = abilityModifier(d.abilities[a]);
          return (
            <NumberField
              key={a}
              ariaLabel={ABILITY_LABEL[a]}
              label={
                <span>
                  {ABILITY_LABEL[a]} <span className="muted">{mod >= 0 ? `+${mod}` : mod}</span>
                </span>
              }
              value={d.abilities[a]}
              onChange={(v) => patch({ abilities: { ...d.abilities, [a]: v ?? 0 } })}
            />
          );
        })}
      </Section>

      <Section title="Proficiencies and senses" cols={2}>
        <TextField
          label="Saves"
          value={savesText}
          placeholder="e.g. dex +4, wis +2"
          onChange={setSavesText}
        />
        <TextField
          label="Skills"
          value={skillsText}
          placeholder="e.g. stealth +6"
          onChange={setSkillsText}
        />
        <TextField
          label="Senses"
          value={d.senses}
          placeholder="e.g. darkvision 60 ft."
          onChange={(senses) => patch({ senses })}
        />
        <TextField
          label="Languages"
          value={d.languages}
          onChange={(languages) => patch({ languages })}
        />
      </Section>

      <Section title="Damage and conditions" cols={2}>
        <ListField
          label="Damage vulnerabilities"
          value={d.damageVulnerabilities}
          onChange={(damageVulnerabilities) => patch({ damageVulnerabilities })}
        />
        <ListField
          label="Damage resistances"
          value={d.damageResistances}
          onChange={(damageResistances) => patch({ damageResistances })}
        />
        <ListField
          label="Damage immunities"
          value={d.damageImmunities}
          onChange={(damageImmunities) => patch({ damageImmunities })}
        />
        <ListField
          label="Condition immunities"
          value={d.conditionImmunities}
          onChange={(conditionImmunities) => patch({ conditionImmunities })}
        />
      </Section>

      <Section title="Where it lives" cols={2}>
        <ListField
          label="Environment"
          value={d.environment}
          onChange={(environment) => patch({ environment })}
        />
        <NumberField
          label="Legendary actions per turn"
          min={0}
          value={d.legendary.perTurn}
          onChange={(perTurn) => patch({ legendary: { ...d.legendary, perTurn } })}
        />
      </Section>

      <Section title="Description" cols={1}>
        <TextBlock
          label="Description"
          rows={3}
          value={d.description ?? ''}
          onChange={(v) => patch({ description: v || undefined })}
        />
      </Section>

      <FeatureListEditor
        label="Traits"
        features={d.traits}
        onChange={(f) => setFeatures('traits', f)}
      />
      <FeatureListEditor
        label="Actions"
        features={d.actions}
        onChange={(f) => setFeatures('actions', f)}
      />
      <FeatureListEditor
        label="Bonus actions"
        features={d.bonusActions}
        onChange={(f) => setFeatures('bonusActions', f)}
      />
      <FeatureListEditor
        label="Reactions"
        features={d.reactions}
        onChange={(f) => setFeatures('reactions', f)}
      />
      <FeatureListEditor
        label="Legendary actions"
        features={d.legendary.actions}
        onChange={(f) => patch({ legendary: { ...d.legendary, actions: f } })}
      />
      <FeatureListEditor
        label="Lair actions"
        features={d.lair}
        onChange={(f) => setFeatures('lair', f)}
      />
    </>
  );
}

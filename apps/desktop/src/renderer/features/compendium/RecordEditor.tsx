import { useState, type ReactNode } from 'react';
import { isDiceExpression } from '@trifold/rules';
import type {
  BackgroundRecord,
  ClassFeature,
  ClassLevel,
  ClassRecord,
  CompendiumRecord,
  ConditionRecord,
  FeatRecord,
  ItemRecord,
  Roll,
  SimpleTrait,
  SpeciesRecord,
  SpellRecord,
} from '@trifold/schema';
import { Icon } from '../shell/icons';
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
import { ITEM_TYPE_NAMES } from './formatting';
import { KIND_NAMES } from './homebrew';
import { MonsterEditor } from './MonsterEditor';

/**
 * Homebrew editors for every kind (DESIGN.md §6.2, ADR 0026), laid out in titled sections with a
 * fixed number of columns each (ADR 0027). `HomebrewEditor` picks the editor for a record's kind;
 * the monster has its own (MonsterEditor). Every editor edits a copy in state and hands the whole
 * record to `onSave`; main validates and writes it. Save waits until the name is filled and
 * every roll is dice.
 */

interface EditorProps<R extends CompendiumRecord> {
  record: R;
  onSave(record: R): void;
  onCancel(): void;
  saving: boolean;
  /** A blank record from New homebrew, not yet saved: the title says New, not Edit. */
  isNew?: boolean;
}

/** An empty field means "not set" for the schema's optional strings. */
const opt = (v: string): string | undefined => (v.trim() ? v : undefined);

const SCHOOLS: Array<readonly [string, string]> = [
  ['', '—'],
  ['A', 'Abjuration'],
  ['C', 'Conjuration'],
  ['D', 'Divination'],
  ['EN', 'Enchantment'],
  ['EV', 'Evocation'],
  ['I', 'Illusion'],
  ['N', 'Necromancy'],
  ['T', 'Transmutation'],
];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact'];
const LEVELS: Array<readonly [string, string]> = Array.from({ length: 10 }, (_, i) => [
  String(i),
  i === 0 ? 'Cantrip' : `Level ${i}`,
]);

/** A known option list with the record's own value kept when it is not one of them. */
function withCurrent(
  options: ReadonlyArray<readonly [string, string]>,
  current: string,
): Array<readonly [string, string]> {
  return options.some(([v]) => v === current) ? [...options] : [[current, current], ...options];
}

/** The form around every editor: the pinned header, then the kind's sections. */
function EditorForm({
  title,
  kind,
  saving,
  canSave,
  onCancel,
  onSubmit,
  children,
}: {
  title: string;
  kind: string;
  saving: boolean;
  canSave: boolean;
  onCancel(): void;
  onSubmit(): void;
  children: ReactNode;
}) {
  return (
    <form
      className="record-editor"
      data-testid="record-editor"
      data-kind={kind}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSubmit();
      }}
    >
      <EditorHead title={title} saving={saving} canSave={canSave} onCancel={onCancel} />
      {children}
    </form>
  );
}

/** A list of named entries with text: species and background traits, class features. */
function NamedTextList<T extends { name: string; text: string }>({
  label,
  singular,
  items,
  blank,
  onChange,
  extra,
}: {
  label: string;
  singular: string;
  items: T[];
  blank(): T;
  onChange(items: T[]): void;
  /** Controls beside the name, e.g. a class feature's Optional box. */
  extra?(item: T, update: (patch: Partial<T>) => void): ReactNode;
}) {
  const update = (i: number, patch: Partial<T>) =>
    onChange(items.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const nameOf = (t: T, i: number) => t.name.trim() || `${singular} ${i + 1}`;
  return (
    <div className="named-list" aria-label={label} role="group">
      {items.map((t, i) => (
        <div key={i} className="feature-edit">
          <div className="row">
            <input
              type="text"
              className="grow"
              aria-label={`${singular} name`}
              placeholder="Name"
              value={t.name}
              onChange={(e) => update(i, { name: e.target.value } as Partial<T>)}
            />
            {extra?.(t, (patch) => update(i, patch))}
            <RowActions
              name={nameOf(t, i)}
              index={i}
              count={items.length}
              onMove={(step) => onChange(moved(items, i, step))}
              onRemove={() => onChange(items.filter((_, j) => j !== i))}
            />
          </div>
          <textarea
            aria-label={`${singular} text`}
            rows={3}
            value={t.text}
            onChange={(e) => update(i, { text: e.target.value } as Partial<T>)}
          />
        </div>
      ))}
      <button type="button" className="btn" onClick={() => onChange([...items, blank()])}>
        <Icon name="plus" />
        Add {singular.toLowerCase()}
      </button>
    </div>
  );
}

const rollsValid = (rolls: readonly Roll[]) => rolls.every((r) => isDiceExpression(r.dice));

/** The dice a record offers as roll buttons: a label, the dice and, for spells, a slot level. */
function RollsSection({
  rolls,
  onChange,
  withLevel = false,
}: {
  rolls: Roll[];
  onChange(rolls: Roll[]): void;
  withLevel?: boolean;
}) {
  const update = (i: number, patch: Partial<Roll>) =>
    onChange(rolls.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="editor-section" aria-label="Rolls">
      <h3>Rolls</h3>
      <p className="editor-hint">Each roll becomes a button on the record that rolls its dice.</p>
      {rolls.map((r, i) => {
        const bad = !isDiceExpression(r.dice);
        const name = r.description?.trim() || `roll ${i + 1}`;
        return (
          <div key={i} className={`roll-edit${withLevel ? ' with-level' : ''}`}>
            <input
              type="text"
              aria-label="Roll label"
              placeholder="Label, e.g. Damage"
              value={r.description ?? ''}
              onChange={(e) => update(i, { description: opt(e.target.value) })}
            />
            <input
              type="text"
              aria-label="Roll dice"
              aria-invalid={bad}
              placeholder="e.g. 8d6"
              value={r.dice}
              onChange={(e) => update(i, { dice: e.target.value })}
            />
            {withLevel && (
              <input
                type="number"
                aria-label="Roll slot level"
                placeholder="Level"
                min={1}
                max={9}
                value={r.level ?? ''}
                onChange={(e) =>
                  update(i, { level: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            )}
            <RowActions
              name={name}
              index={i}
              count={rolls.length}
              onMove={(step) => onChange(moved(rolls, i, step))}
              onRemove={() => onChange(rolls.filter((_, j) => j !== i))}
            />
            {bad && <span className="warn-text small roll-warning">Not dice</span>}
          </div>
        );
      })}
      <button type="button" className="btn" onClick={() => onChange([...rolls, { dice: '1d6' }])}>
        <Icon name="plus" />
        Add roll
      </button>
    </section>
  );
}

/** One editor's state: the record's name and data, and the record they make. */
function useDraft<R extends CompendiumRecord>(record: R) {
  const [name, setName] = useState(record.displayName);
  const [data, setData] = useState<R['data']>(record.data);
  const patch = (p: Partial<R['data']>) => setData((d) => ({ ...d, ...p }));
  const result = (): R => ({ ...record, name, displayName: name, data }) as R;
  return { name, setName, data, patch, result };
}

function titleFor(kind: CompendiumRecord['kind'], isNew?: boolean) {
  return `${isNew ? 'New' : 'Edit'} homebrew ${KIND_NAMES[kind]}`;
}

function SpellEditor({ record, onSave, onCancel, saving, isNew }: EditorProps<SpellRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  return (
    <EditorForm
      title={titleFor('spell', isNew)}
      kind="spell"
      saving={saving}
      canSave={!!name.trim() && rollsValid(d.rolls)}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section
        title="Basics"
        cols={4}
        checks={
          <Check label="Ritual" checked={d.ritual} onChange={(ritual) => patch({ ritual })} />
        }
      >
        <TextField label="Name" value={name} onChange={setName} span={2} required />
        <SelectField
          label="Level"
          value={String(d.level)}
          options={LEVELS}
          onChange={(v) => patch({ level: Number(v) })}
        />
        <SelectField
          label="School"
          value={d.school}
          options={withCurrent(SCHOOLS, d.school)}
          onChange={(school) => patch({ school })}
        />
        <ListField
          label="Classes"
          value={d.classes}
          span="all"
          onChange={(classes) => patch({ classes })}
        />
      </Section>
      <Section title="Casting" cols={4}>
        <TextField label="Casting time" value={d.time} onChange={(time) => patch({ time })} />
        <TextField label="Range" value={d.range} onChange={(range) => patch({ range })} />
        <TextField
          label="Duration"
          value={d.duration}
          onChange={(duration) => patch({ duration })}
        />
        <TextField
          label="Components"
          value={d.components}
          placeholder="e.g. V, S, M"
          onChange={(components) => patch({ components })}
        />
      </Section>
      <Section title="Description" cols={1}>
        <TextBlock label="Text" value={d.text} onChange={(text) => patch({ text })} />
      </Section>
      <RollsSection rolls={d.rolls} withLevel onChange={(rolls) => patch({ rolls })} />
    </EditorForm>
  );
}

function ItemEditor({ record, onSave, onCancel, saving, isNew }: EditorProps<ItemRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  const damageOk = [d.dmg1, d.dmg2].every((x) => !x || isDiceExpression(x));
  const types = withCurrent(Object.entries(ITEM_TYPE_NAMES), d.typeCode);
  const rarities = withCurrent(
    [['', '—'], ...RARITIES.map((r) => [r, r] as const)],
    d.rarity ?? '',
  );
  return (
    <EditorForm
      title={titleFor('item', isNew)}
      kind="item"
      saving={saving}
      canSave={!!name.trim() && rollsValid(d.rolls) && damageOk}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section
        title="Basics"
        cols={4}
        checks={
          <>
            <Check label="Magic" checked={d.magic} onChange={(magic) => patch({ magic })} />
            <Check
              label="Requires attunement"
              checked={!!d.requiresAttunement}
              onChange={(v) => patch({ requiresAttunement: v || undefined })}
            />
          </>
        }
      >
        <TextField label="Name" value={name} onChange={setName} span={2} required />
        <SelectField
          label="Type"
          value={d.typeCode}
          options={types}
          onChange={(typeCode) => patch({ typeCode })}
        />
        <SelectField
          label="Rarity"
          value={d.rarity ?? ''}
          options={rarities}
          onChange={(v) => patch({ rarity: opt(v) })}
        />
        <TextField
          label="Detail"
          value={d.detail}
          span={2}
          placeholder="e.g. requires attunement by a wizard"
          onChange={(v) => patch({ detail: opt(v) })}
        />
        <NumberField
          label="Weight (lb.)"
          value={d.weight}
          onChange={(weight) => patch({ weight })}
        />
        <NumberField label="Value (gp)" value={d.value} onChange={(value) => patch({ value })} />
      </Section>
      <Section
        title="Weapon and armor"
        cols={4}
        hint="Leave these empty for an item that is neither."
        checks={
          <Check
            label="Stealth disadvantage"
            checked={d.stealthDisadvantage}
            onChange={(stealthDisadvantage) => patch({ stealthDisadvantage })}
          />
        }
      >
        <TextField
          label="Damage"
          value={d.dmg1}
          placeholder="e.g. 1d8"
          onChange={(v) => patch({ dmg1: opt(v) })}
        />
        <TextField
          label="Versatile damage"
          value={d.dmg2}
          placeholder="e.g. 1d10"
          onChange={(v) => patch({ dmg2: opt(v) })}
        />
        <TextField
          label="Damage type"
          value={d.dmgType}
          placeholder="e.g. S, P or B"
          onChange={(v) => patch({ dmgType: opt(v) })}
        />
        <TextField label="Range" value={d.range} onChange={(v) => patch({ range: opt(v) })} />
        <ListField
          label="Properties"
          value={d.properties}
          span={2}
          onChange={(properties) => patch({ properties })}
        />
        <NumberField label="AC" value={d.ac} onChange={(ac) => patch({ ac })} />
        <NumberField
          label="Strength needed"
          value={d.strength}
          onChange={(strength) => patch({ strength })}
        />
      </Section>
      <Section title="Description" cols={1}>
        <TextBlock label="Text" value={d.text} onChange={(text) => patch({ text })} />
      </Section>
      <RollsSection rolls={d.rolls} onChange={(rolls) => patch({ rolls })} />
    </EditorForm>
  );
}

function FeatEditor({ record, onSave, onCancel, saving, isNew }: EditorProps<FeatRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  return (
    <EditorForm
      title={titleFor('feat', isNew)}
      kind="feat"
      saving={saving}
      canSave={!!name.trim() && rollsValid(d.rolls)}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section title="Basics" cols={2}>
        <TextField label="Name" value={name} onChange={setName} required />
        <TextField
          label="Prerequisite"
          value={d.prerequisite}
          onChange={(v) => patch({ prerequisite: opt(v) })}
        />
        <TextField
          label="Proficiencies"
          value={d.proficiency}
          span="all"
          onChange={(v) => patch({ proficiency: opt(v) })}
        />
      </Section>
      <Section title="Description" cols={1}>
        <TextBlock label="Text" value={d.text} onChange={(text) => patch({ text })} />
      </Section>
      <RollsSection rolls={d.rolls} onChange={(rolls) => patch({ rolls })} />
    </EditorForm>
  );
}

function ConditionEditor({
  record,
  onSave,
  onCancel,
  saving,
  isNew,
}: EditorProps<ConditionRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  return (
    <EditorForm
      title={titleFor('condition', isNew)}
      kind="condition"
      saving={saving}
      canSave={!!name.trim()}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section title="Basics" cols={2}>
        <TextField label="Name" value={name} onChange={setName} required />
      </Section>
      <Section title="Description" cols={1} hint="Start a line with * or - to make it a bullet.">
        <TextBlock label="Text" value={d.text} onChange={(text) => patch({ text })} />
      </Section>
    </EditorForm>
  );
}

const blankTrait = (): SimpleTrait => ({ name: '', text: '', rolls: [], modifiers: [] });

function SpeciesEditor({ record, onSave, onCancel, saving, isNew }: EditorProps<SpeciesRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  const text = (label: string, key: keyof SpeciesRecord['data'], placeholder?: string) => (
    <TextField
      label={label}
      value={d[key] as string | undefined}
      placeholder={placeholder}
      onChange={(v) => patch({ [key]: opt(v) } as Partial<SpeciesRecord['data']>)}
    />
  );
  return (
    <EditorForm
      title={titleFor('species', isNew)}
      kind="species"
      saving={saving}
      canSave={!!name.trim()}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section title="Basics" cols={4}>
        <TextField label="Name" value={name} onChange={setName} span={2} required />
        {text('Size', 'size', 'e.g. M')}
        {text('Speed', 'speed', 'e.g. 30')}
      </Section>
      <Section title="Abilities and proficiencies" cols={3}>
        {text('Ability scores', 'ability')}
        {text('Languages', 'languages')}
        {text('Skills', 'proficiency')}
        {text('Weapons', 'weapons')}
        {text('Armor', 'armor')}
        {text('Tools', 'tools')}
      </Section>
      <Section title="Defenses and magic" cols={3}>
        {text('Damage resistances', 'resist')}
        {text('Condition immunities', 'conditionImmune')}
        {text('Spellcasting ability', 'spellAbility')}
      </Section>
      <section className="editor-section" aria-label="Traits">
        <h3>Traits</h3>
        <NamedTextList
          label="Traits"
          singular="Trait"
          items={d.traits}
          blank={blankTrait}
          onChange={(traits) => patch({ traits })}
        />
      </section>
    </EditorForm>
  );
}

function BackgroundEditor({
  record,
  onSave,
  onCancel,
  saving,
  isNew,
}: EditorProps<BackgroundRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  return (
    <EditorForm
      title={titleFor('background', isNew)}
      kind="background"
      saving={saving}
      canSave={!!name.trim()}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section title="Basics" cols={2}>
        <TextField label="Name" value={name} onChange={setName} required />
        <TextField
          label="Proficiencies"
          value={d.proficiency}
          onChange={(v) => patch({ proficiency: opt(v) })}
        />
      </Section>
      <section className="editor-section" aria-label="Traits">
        <h3>Traits</h3>
        <NamedTextList
          label="Traits"
          singular="Trait"
          items={d.traits}
          blank={blankTrait}
          onChange={(traits) => patch({ traits })}
        />
      </section>
    </EditorForm>
  );
}

const blankFeature = (): ClassFeature => ({
  name: '',
  text: '',
  optional: false,
  rolls: [],
  modifiers: [],
});

/** Spell slots as the DM types them: comma-separated counts, cantrips first. */
function parseSlots(text: string): ClassLevel['slots'] {
  const values = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Math.max(0, Math.floor(Number(s)) || 0));
  return values.length ? { values, optional: false } : undefined;
}

function ClassLevelEditor({
  level,
  onChange,
  onRemove,
}: {
  level: ClassLevel;
  onChange(level: ClassLevel): void;
  onRemove(): void;
}) {
  const [slotsText, setSlotsText] = useState(level.slots?.values.join(', ') ?? '');
  return (
    <section
      className="editor-section"
      aria-label={`Level ${level.level}`}
      data-testid="class-level"
    >
      <div className="row">
        <h3>Level {level.level}</h3>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label={`Remove level ${level.level}`}
          title="Remove this level"
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="editor-grid cols-2">
        <label className="field">
          Spell slots
          <input
            type="text"
            aria-label={`Level ${level.level} spell slots`}
            placeholder="e.g. 3, 2 (cantrips first)"
            value={slotsText}
            onChange={(e) => setSlotsText(e.target.value)}
            onBlur={() => onChange({ ...level, slots: parseSlots(slotsText) })}
          />
        </label>
      </div>
      <div className="editor-checks">
        <Check
          label="Ability score improvement"
          checked={level.scoreImprovement}
          onChange={(scoreImprovement) => onChange({ ...level, scoreImprovement })}
        />
      </div>
      <h4 className="editor-subhead">Features</h4>
      <NamedTextList
        label="Features"
        singular="Feature"
        items={level.features}
        blank={blankFeature}
        onChange={(features) => onChange({ ...level, features })}
        extra={(f, update) => (
          <Check
            label="Optional"
            checked={f.optional}
            onChange={(optional) => update({ optional })}
          />
        )}
      />
    </section>
  );
}

function ClassEditor({ record, onSave, onCancel, saving, isNew }: EditorProps<ClassRecord>) {
  const { name, setName, data: d, patch, result } = useDraft(record);
  const used = new Set(d.levels.map((l) => l.level));
  const nextLevel = Array.from({ length: 20 }, (_, i) => i + 1).find((n) => !used.has(n));
  const setLevel = (at: number, level: ClassLevel) =>
    patch({ levels: d.levels.map((l) => (l.level === at ? level : l)) });
  return (
    <EditorForm
      title={titleFor('class', isNew)}
      kind="class"
      saving={saving}
      canSave={!!name.trim()}
      onCancel={onCancel}
      onSubmit={() => onSave(result())}
    >
      <Section title="Basics" cols={4}>
        <TextField label="Name" value={name} onChange={setName} span={2} required />
        <SelectField
          label="Hit die"
          value={d.hd === undefined ? '' : String(d.hd)}
          options={[
            ['', '—'],
            ['6', 'd6'],
            ['8', 'd8'],
            ['10', 'd10'],
            ['12', 'd12'],
          ]}
          onChange={(v) => patch({ hd: v === '' ? undefined : Number(v) })}
        />
        <NumberField
          label="Skills to choose"
          value={d.numSkills}
          onChange={(numSkills) => patch({ numSkills })}
        />
      </Section>
      <Section title="Proficiencies" cols={2}>
        <TextField
          label="Saving throws and skills"
          value={d.proficiency}
          span="all"
          onChange={(v) => patch({ proficiency: opt(v) })}
        />
        <TextField label="Armor" value={d.armor} onChange={(v) => patch({ armor: opt(v) })} />
        <TextField label="Weapons" value={d.weapons} onChange={(v) => patch({ weapons: opt(v) })} />
        <TextField label="Tools" value={d.tools} onChange={(v) => patch({ tools: opt(v) })} />
        <TextField
          label="Starting wealth"
          value={d.wealth}
          onChange={(v) => patch({ wealth: opt(v) })}
        />
      </Section>
      <Section title="Spellcasting" cols={2}>
        <TextField
          label="Spellcasting ability"
          value={d.spellAbility}
          onChange={(v) => patch({ spellAbility: opt(v) })}
        />
      </Section>
      {d.levels.map((l) => (
        <ClassLevelEditor
          key={l.level}
          level={l}
          onChange={(next) => setLevel(l.level, next)}
          onRemove={() => patch({ levels: d.levels.filter((x) => x.level !== l.level) })}
        />
      ))}
      {nextLevel !== undefined && (
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              patch({
                levels: [
                  ...d.levels,
                  { level: nextLevel, scoreImprovement: false, features: [], counters: [] },
                ].sort((a, b) => a.level - b.level),
              })
            }
          >
            <Icon name="plus" />
            Add level {nextLevel}
          </button>
        </div>
      )}
    </EditorForm>
  );
}

/** The editor for a homebrew record of any kind. */
export function HomebrewEditor(props: EditorProps<CompendiumRecord>) {
  const { record } = props;
  const as = <R extends CompendiumRecord>(r: R) => ({ ...props, record: r }) as EditorProps<R>;
  switch (record.kind) {
    case 'monster':
      return <MonsterEditor {...as(record)} />;
    case 'spell':
      return <SpellEditor {...as(record)} />;
    case 'item':
      return <ItemEditor {...as(record)} />;
    case 'feat':
      return <FeatEditor {...as(record)} />;
    case 'condition':
      return <ConditionEditor {...as(record)} />;
    case 'species':
      return <SpeciesEditor {...as(record)} />;
    case 'background':
      return <BackgroundEditor {...as(record)} />;
    case 'class':
      return <ClassEditor {...as(record)} />;
  }
}

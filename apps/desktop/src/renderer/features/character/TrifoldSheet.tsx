import { ulid } from 'ulid';
import {
  ABILITY_NAMES,
  attackBonus,
  deriveSheet,
  SKILL_ABILITY,
  SKILL_NAMES,
  type SheetNumbers,
} from '@trifold/rules';
import type { Ability, Character, DerivedKey, Sheet, Skill } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { Icon } from '../shell/icons';
import { DerivedField, NumField, signed } from './fields';

/**
 * A Trifold character's sheet (PLAYER-MODE.md, Way 3; ADR 0068): who they are, abilities, saves
 * and skills, the numbers a fight needs, spellcasting, attacks, features, spells and gear. Every
 * number the rules give is worked out (`deriveSheet`) and can be set by hand, shown as set by
 * hand with a reset. Filled in by the player for now; the builder (a later phase) will write the
 * same sheet.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILLS = Object.keys(SKILL_NAMES) as Skill[];

/** A row's remove button: quiet until the row is hovered or focused (ADR 0020). */
function RemoveRow({ label, onRemove }: { label: string; onRemove(): void }) {
  return (
    <span className="row-actions">
      <button
        type="button"
        className="chrome-btn xs danger"
        aria-label={`Remove ${label}`}
        title="Remove"
        onClick={onRemove}
      >
        <Icon name="trash" />
      </button>
    </span>
  );
}

function AddButton({ label, onAdd }: { label: string; onAdd(): void }) {
  return (
    <button type="button" className="btn" onClick={onAdd}>
      <Icon name="plus" />
      {label}
    </button>
  );
}

export function TrifoldSheet({ character }: { character: Character }) {
  const change = useCharacterStore((s) => s.change);
  const sheet = character.sheet!;
  const id = character.id;
  const n: SheetNumbers = deriveSheet(sheet);
  const set = (patch: Partial<Sheet>) => change(id, { sheet: { ...sheet, ...patch } });
  const override = (key: DerivedKey, value: number | undefined) => {
    const overrides = { ...sheet.overrides };
    if (value === undefined) delete overrides[key];
    else overrides[key] = value;
    set({ overrides });
  };
  /** One list on the sheet: change a row, remove one, add one. */
  const list = <K extends 'classes' | 'attacks' | 'features' | 'spells' | 'equipment'>(key: K) => ({
    rows: sheet[key],
    patch: (i: number, p: Partial<Sheet[K][number]>) =>
      set({
        [key]: sheet[key].map((row, j) => (j === i ? { ...row, ...p } : row)),
      } as Partial<Sheet>),
    remove: (i: number) => set({ [key]: sheet[key].filter((_, j) => j !== i) } as Partial<Sheet>),
    add: (row: Sheet[K][number]) => set({ [key]: [...sheet[key], row] } as Partial<Sheet>),
  });
  const classes = list('classes');
  const attacks = list('attacks');
  const features = list('features');
  const spells = list('spells');
  const equipment = list('equipment');

  return (
    <div className="character-body trifold-sheet" data-testid="trifold-sheet">
      <section className="sheet-section" aria-label="Who they are">
        <h2>Who they are</h2>
        <div className="sheet-grid">
          <label className="field">
            Species
            <input
              type="text"
              aria-label="Species"
              maxLength={80}
              value={sheet.species}
              onChange={(e) => set({ species: e.target.value })}
            />
          </label>
          <label className="field">
            Background
            <input
              type="text"
              aria-label="Background"
              maxLength={80}
              value={sheet.background}
              onChange={(e) => set({ background: e.target.value })}
            />
          </label>
        </div>
        <h3>Classes</h3>
        <ul className="sheet-rows" aria-label="Classes">
          {classes.rows.map((c, i) => (
            <li key={i} className="sheet-row">
              <input
                type="text"
                className="grow"
                aria-label={`Class ${i + 1}`}
                placeholder="Class"
                maxLength={80}
                value={c.name}
                onChange={(e) => classes.patch(i, { name: e.target.value })}
              />
              <input
                type="text"
                className="grow"
                aria-label={`Subclass ${i + 1}`}
                placeholder="Subclass"
                maxLength={80}
                value={c.subclass}
                onChange={(e) => classes.patch(i, { subclass: e.target.value })}
              />
              <NumField
                label={`Level in class ${i + 1}`}
                value={c.level}
                min={1}
                max={20}
                onChange={(v) => v && classes.patch(i, { level: v })}
              />
              <RemoveRow label={c.name || `class ${i + 1}`} onRemove={() => classes.remove(i)} />
            </li>
          ))}
        </ul>
        <div className="row">
          <AddButton
            label="Add a class"
            onAdd={() => classes.add({ name: '', subclass: '', level: 1 })}
          />
          <span className="muted small" data-testid="sheet-level">
            Level {n.level}
          </span>
        </div>
      </section>

      <section className="sheet-section" aria-label="Abilities and saves">
        <h2>Abilities and saving throws</h2>
        <ul className="sheet-abilities">
          {ABILITIES.map((a) => (
            <li key={a} className="sheet-ability">
              <strong>{ABILITY_NAMES[a]}</strong>
              <span className="row">
                <NumField
                  label={ABILITY_NAMES[a]}
                  value={sheet.abilities[a]}
                  min={1}
                  max={30}
                  onChange={(v) => v && set({ abilities: { ...sheet.abilities, [a]: v } })}
                />
                <span className="sheet-mod" aria-label={`${ABILITY_NAMES[a]} modifier`}>
                  {signed(n.modifiers[a])}
                </span>
              </span>
              <span className="row">
                <label className="field inline">
                  <input
                    type="checkbox"
                    aria-label={`Proficient in ${ABILITY_NAMES[a]} saves`}
                    checked={sheet.saves.includes(a)}
                    onChange={(e) =>
                      set({
                        saves: e.target.checked
                          ? [...sheet.saves, a]
                          : sheet.saves.filter((x) => x !== a),
                      })
                    }
                  />
                  Save
                </label>
                <DerivedField
                  label={`${ABILITY_NAMES[a]} save`}
                  derived={n.saves[a]}
                  onOverride={(v) => override(`save.${a}`, v)}
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sheet-section" aria-label="Skills">
        <h2>Skills</h2>
        <ul className="sheet-skills">
          {SKILLS.map((s) => (
            <li key={s} className="sheet-skill">
              <select
                aria-label={`${SKILL_NAMES[s]} training`}
                value={sheet.skills[s] ?? 'none'}
                onChange={(e) => {
                  const skills = { ...sheet.skills };
                  const v = e.target.value;
                  if (v === 'none') delete skills[s];
                  else skills[s] = v as 'proficient' | 'expertise';
                  set({ skills });
                }}
              >
                <option value="none">—</option>
                <option value="proficient">Proficient</option>
                <option value="expertise">Expertise</option>
              </select>
              <span className="grow">
                {SKILL_NAMES[s]}{' '}
                <span className="muted small">({SKILL_ABILITY[s].toUpperCase()})</span>
              </span>
              <DerivedField
                label={SKILL_NAMES[s]}
                derived={n.skills[s]}
                onOverride={(v) => override(`skill.${s}`, v)}
              />
            </li>
          ))}
        </ul>
        <label className="field">
          Other proficiencies and languages
          <textarea
            aria-label="Other proficiencies and languages"
            rows={2}
            value={sheet.otherProficiencies}
            onChange={(e) => set({ otherProficiencies: e.target.value })}
          />
        </label>
      </section>

      <section className="sheet-section" aria-label="In a fight">
        <h2>In a fight</h2>
        <div className="sheet-grid">
          <label className="field">
            Max HP
            <NumField
              label="Max HP"
              value={sheet.maxHp}
              min={1}
              max={999}
              onChange={(v) => v && set({ maxHp: v })}
            />
          </label>
          <span className="field">
            AC
            <DerivedField
              label="AC"
              derived={n.ac}
              min={0}
              max={40}
              onOverride={(v) => override('ac', v)}
            />
          </span>
          <span className="field">
            Initiative
            <DerivedField
              label="Initiative"
              derived={n.initiative}
              min={-10}
              max={20}
              onOverride={(v) => override('initiative', v)}
            />
          </span>
          <label className="field">
            Speed
            <NumField
              label="Speed"
              value={sheet.speed}
              min={0}
              max={200}
              onChange={(v) => v !== undefined && set({ speed: v })}
            />
          </label>
          <span className="field">
            Proficiency bonus
            <DerivedField
              label="Proficiency bonus"
              derived={n.proficiencyBonus}
              min={0}
              max={10}
              onOverride={(v) => override('proficiencyBonus', v)}
            />
          </span>
          <span className="field">
            Passive Perception
            <DerivedField
              label="Passive Perception"
              derived={n.passivePerception}
              min={1}
              max={40}
              onOverride={(v) => override('passivePerception', v)}
            />
          </span>
          <span className="field">
            Passive Insight
            <DerivedField
              label="Passive Insight"
              derived={n.passiveInsight}
              min={1}
              max={40}
              onOverride={(v) => override('passiveInsight', v)}
            />
          </span>
          <span className="field">
            Passive Investigation
            <DerivedField
              label="Passive Investigation"
              derived={n.passiveInvestigation}
              min={1}
              max={40}
              onOverride={(v) => override('passiveInvestigation', v)}
            />
          </span>
        </div>
        <h3>Armour</h3>
        <div className="sheet-grid">
          <label className="field">
            Armour
            <select
              aria-label="Armour"
              value={sheet.armor.kind}
              onChange={(e) =>
                set({ armor: { ...sheet.armor, kind: e.target.value as Sheet['armor']['kind'] } })
              }
            >
              <option value="none">None (10 + Dex)</option>
              <option value="light">Light (base + Dex)</option>
              <option value="medium">Medium (base + Dex, at most 2)</option>
              <option value="heavy">Heavy (base)</option>
            </select>
          </label>
          {sheet.armor.kind !== 'none' && (
            <label className="field">
              Armour’s base AC
              <NumField
                label="Armour’s base AC"
                value={sheet.armor.base}
                min={0}
                max={30}
                onChange={(v) => v !== undefined && set({ armor: { ...sheet.armor, base: v } })}
              />
            </label>
          )}
          <label className="field">
            Other AC bonus
            <NumField
              label="Other AC bonus"
              value={sheet.armor.bonus}
              min={-10}
              max={10}
              onChange={(v) => v !== undefined && set({ armor: { ...sheet.armor, bonus: v } })}
            />
          </label>
          <label className="field inline">
            <input
              type="checkbox"
              aria-label="Shield"
              checked={sheet.armor.shield}
              onChange={(e) => set({ armor: { ...sheet.armor, shield: e.target.checked } })}
            />
            Shield (+2)
          </label>
        </div>
      </section>

      <section className="sheet-section" aria-label="Attacks">
        <h2>Attacks</h2>
        <ul className="sheet-rows" aria-label="Attacks">
          {attacks.rows.map((a, i) => (
            <li key={a.id} className="sheet-row">
              <input
                type="text"
                className="grow"
                aria-label={`Attack ${i + 1} name`}
                placeholder="Longsword"
                maxLength={80}
                value={a.name}
                onChange={(e) => attacks.patch(i, { name: e.target.value })}
              />
              <select
                aria-label={`${a.name || `Attack ${i + 1}`} ability`}
                value={a.ability}
                onChange={(e) => attacks.patch(i, { ability: e.target.value as Ability | 'none' })}
              >
                {ABILITIES.map((ab) => (
                  <option key={ab} value={ab}>
                    {ab.toUpperCase()}
                  </option>
                ))}
                <option value="none">None</option>
              </select>
              <label className="field inline" title="Add your proficiency bonus">
                <input
                  type="checkbox"
                  aria-label={`Proficient with ${a.name || `attack ${i + 1}`}`}
                  checked={a.proficient}
                  onChange={(e) => attacks.patch(i, { proficient: e.target.checked })}
                />
                Prof.
              </label>
              <NumField
                label={`${a.name || `Attack ${i + 1}`} extra bonus`}
                value={a.bonus}
                min={-10}
                max={20}
                onChange={(v) => v !== undefined && attacks.patch(i, { bonus: v })}
              />
              <strong className="sheet-mod" aria-label={`${a.name || `Attack ${i + 1}`} to hit`}>
                {signed(attackBonus(a, n))}
              </strong>
              <input
                type="text"
                className="grow"
                aria-label={`${a.name || `Attack ${i + 1}`} damage`}
                placeholder="1d8+3 slashing"
                maxLength={80}
                value={a.damage}
                onChange={(e) => attacks.patch(i, { damage: e.target.value })}
              />
              <RemoveRow label={a.name || `attack ${i + 1}`} onRemove={() => attacks.remove(i)} />
            </li>
          ))}
        </ul>
        <AddButton
          label="Add an attack"
          onAdd={() =>
            attacks.add({
              id: ulid(),
              name: '',
              ability: 'str',
              proficient: true,
              bonus: 0,
              damage: '',
            })
          }
        />
      </section>

      <section className="sheet-section" aria-label="Spellcasting">
        <h2>Spells</h2>
        <div className="sheet-grid">
          <label className="field">
            Spellcasting ability
            <select
              aria-label="Spellcasting ability"
              value={sheet.spellcastingAbility ?? ''}
              onChange={(e) =>
                set({ spellcastingAbility: (e.target.value || null) as Ability | null })
              }
            >
              <option value="">None</option>
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {ABILITY_NAMES[a]}
                </option>
              ))}
            </select>
          </label>
          {n.spellSaveDc && (
            <span className="field">
              Spell save DC
              <DerivedField
                label="Spell save DC"
                derived={n.spellSaveDc}
                min={1}
                max={40}
                onOverride={(v) => override('spellSaveDc', v)}
              />
            </span>
          )}
          {n.spellAttack && (
            <span className="field">
              Spell attack
              <DerivedField
                label="Spell attack"
                derived={n.spellAttack}
                min={-10}
                max={20}
                showSign
                onOverride={(v) => override('spellAttack', v)}
              />
            </span>
          )}
        </div>
        <ul className="sheet-rows" aria-label="Spells">
          {spells.rows.map((s, i) => (
            <li key={s.id} className="sheet-row">
              <input
                type="text"
                className="grow"
                aria-label={`Spell ${i + 1} name`}
                placeholder="Spell"
                maxLength={120}
                value={s.name}
                onChange={(e) => spells.patch(i, { name: e.target.value })}
              />
              <select
                aria-label={`${s.name || `Spell ${i + 1}`} level`}
                value={s.level}
                onChange={(e) => spells.patch(i, { level: Number(e.target.value) })}
              >
                <option value={0}>Cantrip</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </select>
              <label className="field inline">
                <input
                  type="checkbox"
                  aria-label={`${s.name || `Spell ${i + 1}`} prepared`}
                  checked={s.prepared}
                  onChange={(e) => spells.patch(i, { prepared: e.target.checked })}
                />
                Prepared
              </label>
              <RemoveRow label={s.name || `spell ${i + 1}`} onRemove={() => spells.remove(i)} />
            </li>
          ))}
        </ul>
        <AddButton
          label="Add a spell"
          onAdd={() => spells.add({ id: ulid(), name: '', level: 0, prepared: false })}
        />
      </section>

      <section className="sheet-section" aria-label="Features and traits">
        <h2>Features and traits</h2>
        <ul className="sheet-rows stacked" aria-label="Features">
          {features.rows.map((f, i) => (
            <li key={f.id} className="sheet-row stacked">
              <span className="row">
                <input
                  type="text"
                  className="grow"
                  aria-label={`Feature ${i + 1} name`}
                  placeholder="Feature"
                  maxLength={120}
                  value={f.name}
                  onChange={(e) => features.patch(i, { name: e.target.value })}
                />
                <input
                  type="text"
                  aria-label={`${f.name || `Feature ${i + 1}`} comes from`}
                  placeholder="From (Fighter 2, Elf…)"
                  maxLength={80}
                  value={f.from}
                  onChange={(e) => features.patch(i, { from: e.target.value })}
                />
                <RemoveRow
                  label={f.name || `feature ${i + 1}`}
                  onRemove={() => features.remove(i)}
                />
              </span>
              <textarea
                aria-label={`${f.name || `Feature ${i + 1}`} text`}
                rows={2}
                value={f.text}
                onChange={(e) => features.patch(i, { text: e.target.value })}
              />
            </li>
          ))}
        </ul>
        <AddButton
          label="Add a feature"
          onAdd={() => features.add({ id: ulid(), name: '', from: '', text: '' })}
        />
      </section>

      <section className="sheet-section" aria-label="Equipment">
        <h2>Equipment</h2>
        <ul className="sheet-rows" aria-label="Equipment">
          {equipment.rows.map((item, i) => (
            <li key={item.id} className="sheet-row">
              <input
                type="text"
                className="grow"
                aria-label={`Item ${i + 1} name`}
                placeholder="Item"
                maxLength={120}
                value={item.name}
                onChange={(e) => equipment.patch(i, { name: e.target.value })}
              />
              <NumField
                label={`${item.name || `Item ${i + 1}`} quantity`}
                value={item.quantity}
                min={0}
                max={9999}
                onChange={(v) => v !== undefined && equipment.patch(i, { quantity: v })}
              />
              <RemoveRow
                label={item.name || `item ${i + 1}`}
                onRemove={() => equipment.remove(i)}
              />
            </li>
          ))}
        </ul>
        <label className="field inline">
          Gold
          <NumField
            label="Gold"
            value={sheet.gp}
            min={0}
            max={10_000_000}
            onChange={(v) => v !== undefined && set({ gp: v })}
          />
        </label>
        <AddButton
          label="Add an item"
          onAdd={() => equipment.add({ id: ulid(), name: '', quantity: 1 })}
        />
      </section>

      <section className="sheet-section" aria-label="Notes">
        <h2>Notes</h2>
        <textarea
          aria-label="Notes"
          rows={4}
          value={character.notes}
          onChange={(e) => change(id, { notes: e.target.value })}
        />
      </section>
    </div>
  );
}

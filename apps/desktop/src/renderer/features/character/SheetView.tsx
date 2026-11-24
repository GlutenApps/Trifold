import type { ReactNode } from 'react';
import {
  ABILITY_NAMES,
  attackBonus,
  classLine,
  deriveSheet,
  SKILL_NAMES,
  tableNumbers,
} from '@trifold/rules';
import type { Ability, Character, Skill } from '@trifold/schema';
import { useShellStore } from '../../stores/shellStore';
import { Icon } from '../shell/icons';
import { LinkedRow } from './LinkedRow';
import { signed } from './fields';

/**
 * A character's sheet to read at the table (docs/PLAYER-MODE.md, "My characters and Sheets";
 * ADR 0069): the numbers a fight needs at the top, then what the sheet holds. A Trifold
 * character shows its whole sheet with every number worked out; an External one its table
 * numbers and its sheet link. Edit switches to the editor. `live` is the table's HP and
 * conditions, shown above everything while connected.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const SKILLS = Object.keys(SKILL_NAMES) as Skill[];

function Stat({ label, value, mark }: { label: string; value: ReactNode; mark?: boolean }) {
  return (
    <div
      className={`sheet-stat${mark ? ' overridden' : ''}`}
      title={mark ? 'Set by hand' : undefined}
    >
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Opens a character's sheet link as a web tab (ADR 0011). */
function SheetLink({ character }: { character: Character }) {
  const addWebTab = useShellStore((s) => s.addWebTab);
  if (!character.sheetUrl) return null;
  const url = character.sheetUrl;
  return (
    <button
      type="button"
      className="btn"
      onClick={() => addWebTab({ url, title: `${character.name}’s sheet` })}
    >
      <Icon name="external" />
      Open character sheet
    </button>
  );
}

export function SheetView({
  character,
  onEdit,
  live,
}: {
  character: Character;
  /** Absent for a preview (Import from PDF), which has nothing to edit yet. */
  onEdit?(): void;
  live?: ReactNode;
}) {
  const t = tableNumbers(character);
  const sheet = character.kind === 'trifold' ? character.sheet : undefined;
  const n = sheet ? deriveSheet(sheet) : null;

  return (
    <div className="sheet-view" data-testid="sheet-view">
      <div className="row sheet-view-head">
        <div className="grow">
          <h2 className="sheet-view-name">{character.name}</h2>
          <span className="muted small">
            {(sheet ? classLine(sheet) : t.classText) || `Level ${t.level}`}
            {sheet?.species ? ` · ${sheet.species}` : ''}
            {sheet?.background ? ` · ${sheet.background}` : ''}
            {character.edition === '2014' ? ' · legacy rules' : ''}
          </span>
        </div>
        <SheetLink character={character} />
        {onEdit && (
          <button
            type="button"
            className="btn"
            aria-label={`Edit ${character.name}`}
            onClick={onEdit}
          >
            <Icon name="pencil" />
            Edit
          </button>
        )}
      </div>
      {live}

      <div className="sheet-stats" aria-label="Numbers">
        <Stat label="AC" value={t.ac} mark={n?.ac.overridden} />
        <Stat label="Max HP" value={t.maxHp} />
        <Stat
          label="Initiative"
          value={signed(t.initiativeBonus)}
          mark={n?.initiative.overridden}
        />
        <Stat label="Speed" value={t.speed} />
        {n && (
          <Stat
            label="Proficiency"
            value={signed(n.proficiencyBonus.value)}
            mark={n.proficiencyBonus.overridden}
          />
        )}
        <Stat label="Passive Perception" value={t.passives.perception} />
        <Stat label="Passive Insight" value={t.passives.insight} />
        <Stat label="Passive Investigation" value={t.passives.investigation} />
        {t.spellSaveDc !== undefined && <Stat label="Spell save DC" value={t.spellSaveDc} />}
        {n?.spellAttack && <Stat label="Spell attack" value={signed(n.spellAttack.value)} />}
      </div>

      <section className="sheet-view-section" aria-label="Abilities and saves">
        <h3>{n ? 'Abilities and saving throws' : 'Saving throws'}</h3>
        <ul className="sheet-view-abilities">
          {ABILITIES.map((a) => (
            <li key={a}>
              <span className="muted small">{ABILITY_NAMES[a]}</span>
              {sheet && n && (
                <strong>
                  {sheet.abilities[a]} <span className="muted">({signed(n.modifiers[a])})</span>
                </strong>
              )}
              <span className={sheet?.saves.includes(a) ? 'sheet-trained' : undefined}>
                Save {t.saves[a] === undefined ? '—' : signed(t.saves[a])}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {sheet && n && (
        <>
          <section className="sheet-view-section" aria-label="Skills">
            <h3>Skills</h3>
            <ul className="sheet-view-skills">
              {SKILLS.map((s) => (
                <li key={s} className={sheet.skills[s] ? 'sheet-trained' : undefined}>
                  <span>
                    {SKILL_NAMES[s]}
                    {sheet.skills[s] === 'expertise' && (
                      <span className="muted small"> (expertise)</span>
                    )}
                  </span>
                  <strong>{signed(n.skills[s].value)}</strong>
                </li>
              ))}
            </ul>
            {sheet.otherProficiencies.trim() && (
              <p className="small sheet-view-text">{sheet.otherProficiencies}</p>
            )}
          </section>

          {sheet.attacks.length > 0 && (
            <section className="sheet-view-section" aria-label="Attacks">
              <h3>Attacks</h3>
              <ul className="sheet-view-list">
                {sheet.attacks.map((a) => (
                  <li key={a.id}>
                    <strong>{a.name || 'Attack'}</strong>
                    <span>{signed(attackBonus(a, n))} to hit</span>
                    <span className="muted">{a.damage}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(sheet.spells.length > 0 || sheet.slots.length > 0) && (
            <section className="sheet-view-section" aria-label="Spells">
              <h3>Spells</h3>
              {sheet.slots.length > 0 && (
                <p className="small" data-testid="sheet-slots">
                  Slots:{' '}
                  {sheet.slots
                    .map((n, i) => (n ? `level ${i + 1} × ${n}` : ''))
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <ul className="sheet-view-list">
                {[...sheet.spells]
                  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                  .map((s) => {
                    const row = (
                      <>
                        <strong>{s.name || 'Spell'}</strong>
                        <span className="muted">
                          {s.level === 0 ? 'Cantrip' : `Level ${s.level}`}
                        </span>
                        {s.prepared && <span className="badge">prepared</span>}
                      </>
                    );
                    return s.ref ? (
                      <li key={s.id} className="sheet-view-linked-row">
                        <LinkedRow sheetRef={s.ref} summary={row} />
                      </li>
                    ) : (
                      <li key={s.id}>{row}</li>
                    );
                  })}
              </ul>
            </section>
          )}

          {sheet.features.length > 0 && (
            <section className="sheet-view-section" aria-label="Features and traits">
              <h3>Features and traits</h3>
              {sheet.features.map((f) => {
                const summary = (
                  <>
                    <strong>{f.name || 'Feature'}</strong>
                    {f.from && <span className="muted small"> · {f.from}</span>}
                  </>
                );
                const text = f.text && <p className="small sheet-view-text">{f.text}</p>;
                return f.ref ? (
                  <LinkedRow key={f.id} sheetRef={f.ref} summary={summary}>
                    {text}
                  </LinkedRow>
                ) : (
                  <details key={f.id} className="sheet-view-feature">
                    <summary>{summary}</summary>
                    {text}
                  </details>
                );
              })}
            </section>
          )}

          {(sheet.equipment.length > 0 || sheet.gp > 0) && (
            <section className="sheet-view-section" aria-label="Equipment">
              <h3>Equipment</h3>
              <ul className="sheet-view-list">
                {sheet.equipment.map((item) => {
                  const row = (
                    <>
                      <span>{item.name || 'Item'}</span>
                      {item.quantity !== 1 && <span className="muted">× {item.quantity}</span>}
                    </>
                  );
                  return item.ref ? (
                    <li key={item.id} className="sheet-view-linked-row">
                      <LinkedRow sheetRef={item.ref} summary={row} />
                    </li>
                  ) : (
                    <li key={item.id}>{row}</li>
                  );
                })}
              </ul>
              {sheet.gp > 0 && <p className="small">{sheet.gp.toLocaleString()} GP</p>}
            </section>
          )}
        </>
      )}

      {character.notes.trim() && (
        <section className="sheet-view-section" aria-label="Notes">
          <h3>Notes</h3>
          <p className="small sheet-view-text">{character.notes}</p>
        </section>
      )}
    </div>
  );
}

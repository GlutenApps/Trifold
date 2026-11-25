import { useState, type ReactNode } from 'react';
import {
  hitDice,
  longRest,
  setSlotsUsed,
  shortRest,
  spendHitDie,
  type HitDie,
  type RestResult,
} from '@trifold/rules';
import type { CharacterEdition, Sheet } from '@trifold/schema';

/**
 * Resources on a Trifold sheet (ADR 0074; their look, ADR 0080): limited-use features, hit dice,
 * Heroic Inspiration and spell slots as rows of pips, and the Short rest and Long rest buttons.
 * HP and death saves stay the table's: spending a hit die sends its healing there when the
 * sheet is at the table (`onHeal`), and only says the total when it is not.
 */

const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

/**
 * Something the sheet did that is not a roll (a rest, a hit die, a cast), to say where the last
 * roll shows. `undo` puts the sheet back as it was.
 */
export interface SheetEvent {
  label: string;
  /** A number to show where a roll's total goes (a hit die's healing). */
  total?: number;
  detail: string;
  undo?: Sheet;
}

/**
 * A row of pips (ADR 0080): a filled dot is one left, a hollow one is spent. With `onChange`
 * each is a button, a dot in a round target that lights on hover: pressing a filled one spends
 * one, pressing a hollow one gives one back. Without it the dots are smaller and inert, so a
 * read-only sheet shows the count without looking pressable.
 */
export function Pips({
  label,
  max,
  used,
  onChange,
}: {
  /** One of them, as a screen reader names it: "Level 1 slot", "Channel Divinity use". */
  label: string;
  max: number;
  used: number;
  onChange?: ((used: number) => void) | null | undefined;
}) {
  const spent = Math.min(max, Math.max(0, used));
  const left = max - spent;
  return (
    <span
      className={`sh-pips${onChange ? '' : ' static'}`}
      role="group"
      aria-label={`${label}: ${left} of ${max} left`}
    >
      {Array.from({ length: max }, (_, i) => {
        const on = i < left;
        return onChange ? (
          <button
            key={i}
            type="button"
            className={`sh-pip${on ? ' on' : ''}`}
            aria-pressed={!on}
            aria-label={`${label} ${i + 1}, ${on ? 'available' : 'used'}`}
            title={on ? 'Mark one used' : 'Get one back'}
            onClick={() => onChange(on ? spent + 1 : spent - 1)}
          />
        ) : (
          <span key={i} className={`sh-pip${on ? ' on' : ''}`} aria-hidden="true" />
        );
      })}
    </span>
  );
}

/** One resource: its name and what it is at, then its pips. */
function ResourceRow({ name, sub, pips }: { name: string; sub: string; pips: ReactNode }) {
  return (
    <div className="res-row">
      <span className="res-id">
        <span className="res-name">{name}</span>
        <span className="res-sub">{sub}</span>
      </span>
      {pips}
    </div>
  );
}

export function ResourcesSection({
  sheet,
  edition,
  onChange,
  onHeal,
  slots = true,
  onSaid,
}: {
  sheet: Sheet;
  edition: CharacterEdition;
  onChange(next: Sheet): void;
  /** At the table: sends a hit die's healing as an HP change. */
  onHeal?(amount: number): void;
  /** Show spell slots here; the sheet view shows them on each spell level instead. */
  slots?: boolean;
  /** Where to say what a rest or a hit die did; without it, a line under the buttons says it. */
  onSaid?(event: SheetEvent): void;
}) {
  const [said, setSaid] = useState<SheetEvent | null>(null);
  const [confirmLong, setConfirmLong] = useState(false);
  const slotLevels = slots
    ? sheet.slots.map((n, i) => ({ level: i + 1, max: n })).filter((s) => s.max > 0)
    : [];
  const limited = sheet.features.filter((f) => f.uses);
  const pools = hitDice(sheet);
  const say = (event: SheetEvent) => (onSaid ? onSaid(event) : setSaid(event));

  const rest = (kind: 'short' | 'long') => {
    const out: RestResult = kind === 'short' ? shortRest(sheet) : longRest(sheet, edition);
    onChange(out.sheet);
    say({
      label: kind === 'short' ? 'Short rest' : 'Long rest',
      detail: out.restored.length ? `${out.restored.join(', ')} back` : 'nothing was spent',
      undo: sheet,
    });
  };

  const spend = (die: HitDie) => {
    const out = spendHitDie(sheet, die, rollDie);
    if (!out) return;
    onChange(out.sheet);
    onHeal?.(out.healed);
    say({
      label: 'Hit die',
      total: out.healed,
      detail: `rolled ${out.rolled} on a d${die}, ${out.healed} HP${
        onHeal ? ', sent to the table' : '; add it to your hit points'
      }`,
    });
  };

  return (
    <section className="sheet-section resources" aria-label="Resources" data-testid="resources">
      <h2>Resources</h2>
      <div className="res-rows">
        <ResourceRow
          name="Heroic Inspiration"
          sub={sheet.inspiration ? 'Ready to use' : 'None right now'}
          pips={
            <Pips
              label="Heroic Inspiration"
              max={1}
              used={sheet.inspiration ? 0 : 1}
              onChange={(used) => onChange({ ...sheet, inspiration: used === 0 })}
            />
          }
        />
        {slotLevels.map(({ level, max }) => {
          const used = Math.min(max, sheet.slotsUsed?.[level - 1] ?? 0);
          return (
            <ResourceRow
              key={`slot${level}`}
              name={`Level ${level} slots`}
              sub={`${max - used} of ${max} left`}
              pips={
                <Pips
                  label={`Level ${level} slot`}
                  max={max}
                  used={used}
                  onChange={(n) => onChange(setSlotsUsed(sheet, level, n))}
                />
              }
            />
          );
        })}
        {limited.map((f) => {
          const uses = f.uses!;
          const used = Math.min(uses.max, uses.used);
          return (
            <ResourceRow
              key={f.id}
              name={f.name || 'Feature'}
              sub={`${uses.reset === 'short' ? 'Short rest' : 'Long rest'}, ${uses.max - used} of ${uses.max} left`}
              pips={
                <Pips
                  label={`${f.name || 'Feature'} use`}
                  max={uses.max}
                  used={used}
                  onChange={(n) =>
                    onChange({
                      ...sheet,
                      features: sheet.features.map((x) =>
                        x.id === f.id && x.uses ? { ...x, uses: { ...x.uses, used: n } } : x,
                      ),
                    })
                  }
                />
              }
            />
          );
        })}
        {pools.map((p) => (
          <ResourceRow
            key={`hd${p.die}`}
            name="Hit dice"
            sub={`${p.left} of ${p.total} d${p.die} left`}
            pips={
              <Pips
                label={`Hit die d${p.die}`}
                max={p.total}
                used={p.total - p.left}
                onChange={(n) =>
                  onChange({ ...sheet, hitDiceUsed: { ...sheet.hitDiceUsed, [p.die]: n } })
                }
              />
            }
          />
        ))}
      </div>

      {confirmLong ? (
        <div
          className="res-actions inline-confirm"
          role="group"
          aria-label="Take a long rest?"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setConfirmLong(false);
            }
          }}
        >
          <span className="muted small res-question">
            Take a long rest? Spell slots, uses and hit dice come back.
          </span>
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              setConfirmLong(false);
              rest('long');
            }}
          >
            Long rest
          </button>
          <button
            type="button"
            className="btn small"
            autoFocus
            onClick={() => setConfirmLong(false)}
          >
            Keep
          </button>
        </div>
      ) : (
        <div className="res-actions">
          {pools.map((p) => (
            <button
              key={p.die}
              type="button"
              className="btn"
              disabled={p.left === 0}
              title={
                p.left === 0
                  ? `No d${p.die} hit dice left`
                  : `Roll a d${p.die} plus Constitution${onHeal ? ' and heal at the table' : ''}`
              }
              onClick={() => spend(p.die)}
            >
              Spend a d{p.die}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => rest('short')}>
            Short rest
          </button>
          <button type="button" className="btn" onClick={() => setConfirmLong(true)}>
            Long rest
          </button>
        </div>
      )}
      {!onSaid && said && (
        <p className="small" role="status" data-testid="resources-said">
          {said.label}: {said.detail}.{' '}
          {said.undo && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                onChange(said.undo!);
                setSaid(null);
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
    </section>
  );
}

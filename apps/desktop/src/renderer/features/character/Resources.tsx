import { useState } from 'react';
import {
  hitDice,
  longRest,
  shortRest,
  spendHitDie,
  type HitDie,
  type RestResult,
} from '@trifold/rules';
import type { CharacterEdition, Sheet } from '@trifold/schema';

/**
 * Resources on a Trifold sheet (ADR 0074): spell slots spent, limited-use features, hit dice and
 * Heroic Inspiration, and the Short rest and Long rest buttons. HP and death saves stay the
 * table's: spending a hit die sends its healing there when the sheet is at the table (`onHeal`),
 * and only says the total when it is not.
 */

const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

/** A row of boxes, the first `used` ticked: ticking one spends it, unticking gives one back. */
function Pips({
  label,
  max,
  used,
  onChange,
}: {
  label: string;
  max: number;
  used: number;
  onChange(used: number): void;
}) {
  return (
    <span className="resource-pips" role="group" aria-label={`${label}: ${used} of ${max} used`}>
      {Array.from({ length: max }, (_, i) => {
        const on = i < used;
        return (
          <input
            key={i}
            type="checkbox"
            aria-label={`${label} ${i + 1}`}
            checked={on}
            onChange={() => onChange(on ? used - 1 : used + 1)}
          />
        );
      })}
    </span>
  );
}

export function ResourcesSection({
  sheet,
  edition,
  onChange,
  onHeal,
}: {
  sheet: Sheet;
  edition: CharacterEdition;
  onChange(next: Sheet): void;
  /** At the table: sends a hit die's healing as an HP change. */
  onHeal?(amount: number): void;
}) {
  const [said, setSaid] = useState<{ text: string; undo?: Sheet } | null>(null);
  const slotLevels = sheet.slots.map((n, i) => ({ level: i + 1, max: n })).filter((s) => s.max > 0);
  const limited = sheet.features.filter((f) => f.uses);
  const pools = hitDice(sheet);

  const rest = (kind: 'short' | 'long') => {
    const out: RestResult = kind === 'short' ? shortRest(sheet) : longRest(sheet, edition);
    onChange(out.sheet);
    setSaid({
      text: `${kind === 'short' ? 'Short rest' : 'Long rest'}: ${
        out.restored.length ? `${out.restored.join(', ')} back.` : 'nothing was spent.'
      }`,
      undo: sheet,
    });
  };

  const spend = (die: HitDie) => {
    const out = spendHitDie(sheet, die, rollDie);
    if (!out) return;
    onChange(out.sheet);
    onHeal?.(out.healed);
    setSaid({
      text: `Rolled ${out.rolled} on a d${die}: ${out.healed} HP${
        onHeal ? ', sent to the table.' : '. Add it to your hit points.'
      }`,
    });
  };

  return (
    <section className="sheet-section resources" aria-label="Resources" data-testid="resources">
      <h2>Resources</h2>
      <label className="field inline">
        <input
          type="checkbox"
          checked={!!sheet.inspiration}
          onChange={(e) => onChange({ ...sheet, inspiration: e.target.checked })}
        />
        Heroic Inspiration
      </label>

      {slotLevels.length > 0 && (
        <div className="resource-rows">
          {slotLevels.map(({ level, max }) => (
            <div key={level} className="row resource-row">
              <span className="resource-name">Level {level} slots</span>
              <Pips
                label={`Level ${level} slot`}
                max={max}
                used={Math.min(max, sheet.slotsUsed?.[level - 1] ?? 0)}
                onChange={(used) => {
                  const slotsUsed = [...(sheet.slotsUsed ?? [])];
                  while (slotsUsed.length < level) slotsUsed.push(0);
                  slotsUsed[level - 1] = used;
                  onChange({ ...sheet, slotsUsed });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {limited.length > 0 && (
        <div className="resource-rows">
          {limited.map((f) => (
            <div key={f.id} className="row resource-row">
              <span className="resource-name">
                {f.name || 'Feature'}
                <span className="muted small">
                  {' '}
                  · {f.uses!.reset === 'short' ? 'short rest' : 'long rest'}
                </span>
              </span>
              <Pips
                label={f.name || 'Feature'}
                max={f.uses!.max}
                used={Math.min(f.uses!.max, f.uses!.used)}
                onChange={(used) =>
                  onChange({
                    ...sheet,
                    features: sheet.features.map((x) =>
                      x.id === f.id && x.uses ? { ...x, uses: { ...x.uses, used } } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      )}

      {pools.length > 0 && (
        <div className="resource-rows">
          {pools.map((p) => (
            <div key={p.die} className="row resource-row">
              <span className="resource-name">
                Hit dice: {p.left} of {p.total} d{p.die} left
              </span>
              <button
                type="button"
                className="btn"
                disabled={p.left === 0}
                onClick={() => spend(p.die)}
              >
                Spend a d{p.die}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <button type="button" className="btn" onClick={() => rest('short')}>
          Short rest
        </button>
        <button type="button" className="btn" onClick={() => rest('long')}>
          Long rest
        </button>
      </div>
      {said && (
        <p className="small" role="status" data-testid="resources-said">
          {said.text}{' '}
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

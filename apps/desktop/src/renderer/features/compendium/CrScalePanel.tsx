import { useMemo, useState } from 'react';
import { CR_ORDER, scaleCr, SCALE_PARTS, type ScaleLine, type ScalePart } from '@trifold/rules';
import type { MonsterRecord } from '@trifold/schema';
import { Icon } from '../shell/icons';

type Data = MonsterRecord['data'];

/**
 * The CR scaler (DESIGN.md §6.2, Beta 8, ADR 0038), always on show at the top of the monster
 * editor's Challenge section: step the CR down or up (or pick one), see each change as old → new,
 * untick any part to leave it, and Apply to the form. Nothing is written until the editor's Save.
 * The name never changes; the stat block gets a Scaled tag. The editor remounts it (key = CR)
 * whenever the CR changes, so it always starts from the form's CR.
 */
const PART_LABEL: Record<ScalePart, string> = {
  hp: 'Hit points',
  ac: 'Armor class',
  attack: 'Attack bonuses',
  dc: 'Save DCs',
  damage: 'Damage',
  proficiency: 'Saving throws and skills',
  attacks: 'Multiattack',
};

export function CrScalePanel({
  data,
  name,
  onApply,
}: {
  data: Data;
  name: string;
  onApply(next: Data): void;
}) {
  const [toCr, setToCr] = useState(data.cr);
  const [skipped, setSkipped] = useState<Set<ScalePart>>(new Set());
  const [changeAttacks, setChangeAttacks] = useState(false);

  const parts = useMemo(() => {
    const on = new Set<ScalePart>(SCALE_PARTS.filter((p) => !skipped.has(p)));
    if (changeAttacks) on.add('attacks');
    return on;
  }, [skipped, changeAttacks]);
  // Every line on offer (all parts), and the result of only the ticked ones.
  const offered = useMemo(
    () => scaleCr(data, toCr, new Set<ScalePart>([...SCALE_PARTS, 'attacks']), name),
    [data, toCr, name],
  );
  const result = useMemo(() => scaleCr(data, toCr, parts, name), [data, toCr, parts, name]);
  const same = toCr === data.cr;

  const at = CR_ORDER.indexOf(toCr as (typeof CR_ORDER)[number]);
  const pick = (cr: string) => {
    setToCr(cr);
    setChangeAttacks(false);
  };
  const step = (by: -1 | 1) => {
    // A CR off the list (hand-typed) steps from where it would sort: 0 down, 1 up.
    const from = at >= 0 ? at : by > 0 ? -1 : CR_ORDER.length;
    const next = CR_ORDER[Math.min(CR_ORDER.length - 1, Math.max(0, from + by))];
    if (next) pick(next);
  };
  const reset = () => pick(data.cr);

  const byPart = new Map<ScalePart, ScaleLine[]>();
  for (const line of offered.lines) {
    if (line.part === 'cr') continue;
    if (line.part === 'attacks' && !offered.attackOffer) continue;
    byPart.set(line.part, [...(byPart.get(line.part) ?? []), line]);
  }
  const crLine = offered.lines.find((l) => l.part === 'cr');
  const toggle = (part: ScalePart, on: boolean) => {
    if (part === 'attacks') return setChangeAttacks(on);
    setSkipped((s) => {
      const next = new Set(s);
      if (on) next.delete(part);
      else next.add(part);
      return next;
    });
  };

  return (
    <div
      className={`cr-scale${same ? '' : ' open'}`}
      role="group"
      aria-label="Scale to another CR"
      data-testid="cr-scale"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !same) {
          e.stopPropagation();
          reset();
        }
      }}
    >
      <div className="cr-scale-head">
        <Icon name="sliders" />
        <strong>Scale to another CR</strong>
        <span className="cr-scale-stepper">
          <button
            type="button"
            className="btn"
            aria-label="One CR lower"
            title="One CR lower"
            disabled={at === 0}
            onClick={() => step(-1)}
          >
            <Icon name="minus" />
          </button>
          <select
            aria-label="New challenge rating"
            value={toCr}
            onChange={(e) => pick(e.target.value)}
          >
            {at < 0 && <option value={toCr}>{toCr || '—'}</option>}
            {CR_ORDER.map((cr) => (
              <option key={cr} value={cr}>
                {cr}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            aria-label="One CR higher"
            title="One CR higher"
            disabled={at === CR_ORDER.length - 1}
            onClick={() => step(1)}
          >
            <Icon name="plus" />
          </button>
        </span>
      </div>
      {same ? (
        <p className="muted small">
          Moves hit points, armor class, attack bonuses, save DCs and damage together, by how much a
          typical monster’s change between the two CRs. You see every change before it is applied.
        </p>
      ) : (
        <>
          <p className="muted small">
            Damage keeps its dice size and adds or drops dice. Untick anything to leave it as it is.
            The name stays the same; the stat block shows a Scaled tag.
          </p>
          {crLine && (
            <p data-testid="cr-scale-cr">
              <strong>Challenge</strong> {crLine.from} → {crLine.to}
            </p>
          )}
          <ul className="books-list cr-scale-list">
            {[...byPart.entries()].map(([part, lines]) => {
              const on = part === 'attacks' ? changeAttacks : !skipped.has(part);
              return (
                <li key={part}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggle(part, e.target.checked)}
                    />
                    <strong>
                      {part === 'attacks'
                        ? offered.attackOffer === 'add'
                          ? 'Add an attack'
                          : 'Remove an attack'
                        : PART_LABEL[part]}
                    </strong>
                  </label>
                  <ul className="cr-scale-lines">
                    {lines.map((l, i) => (
                      <li key={i} className={on ? undefined : 'muted'}>
                        {part === 'damage' || l.label !== PART_LABEL[part] ? `${l.label}: ` : ''}
                        {l.from} → {l.to}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          {offered.notes.length > 0 && (
            <p className="muted small" data-testid="cr-scale-notes">
              {offered.notes.join(' ')}
            </p>
          )}
          <div className="books-panel-foot">
            <button type="button" className="btn" onClick={reset}>
              Keep CR {data.cr || '—'}
            </button>
            <button type="button" className="btn primary" onClick={() => onApply(result.monster)}>
              Apply CR {toCr} to the form
            </button>
          </div>
        </>
      )}
    </div>
  );
}

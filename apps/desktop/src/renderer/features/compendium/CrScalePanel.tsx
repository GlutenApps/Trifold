import { useMemo, useState } from 'react';
import { CR_ORDER, scaleCr, SCALE_PARTS, type ScaleLine, type ScalePart } from '@trifold/rules';
import type { MonsterRecord } from '@trifold/schema';
import { Icon } from '../shell/icons';

type Data = MonsterRecord['data'];

/**
 * The CR scaler (DESIGN.md §6.2, Beta 8, ADR 0038), inside the monster editor: pick a CR, see
 * each change as old → new, untick any part to leave it, and Apply to the form. Nothing is
 * written until the editor's Save. The name never changes; the stat block gets a Scaled tag.
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
  onClose,
}: {
  data: Data;
  name: string;
  onApply(next: Data): void;
  onClose(): void;
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
      className="books-panel cr-scale"
      role="group"
      aria-label="Scale to another CR"
      data-testid="cr-scale"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="books-panel-head">
        <strong>Scale to another CR</strong>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close the CR scaler"
          title="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted small">
        Each number moves by how much a typical monster’s does between the two CRs, so this one
        keeps its strengths. Damage keeps its dice size and adds or drops dice. Untick anything to
        leave it as it is. The name stays the same; the stat block shows a Scaled tag.
      </p>
      <label className="field cr-scale-target">
        New CR
        <select
          aria-label="New challenge rating"
          value={toCr}
          onChange={(e) => {
            setToCr(e.target.value);
            setChangeAttacks(false);
          }}
        >
          {CR_ORDER.map((cr) => (
            <option key={cr} value={cr}>
              {cr}
            </option>
          ))}
        </select>
      </label>
      {same ? (
        <p className="muted">Pick a different CR to see what would change.</p>
      ) : (
        <>
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
        </>
      )}
      <div className="books-panel-foot">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={same}
          onClick={() => onApply(result.monster)}
        >
          Apply to the form
        </button>
      </div>
    </div>
  );
}

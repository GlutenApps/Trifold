import { useMemo, useState } from 'react';
import {
  balancePlan,
  CR_ORDER,
  LEVEL_PARTS,
  MAX_ATTACKS,
  planFor,
  scaleCr,
  SCALE_PARTS,
  stepCr,
  tuneCr,
  tuneOptions,
  type LevelPart,
  type ScaleLine,
  type ScalePart,
  type TunePlan,
} from '@trifold/rules';
import type { MonsterRecord } from '@trifold/schema';
import { Icon } from '../shell/icons';

type Data = MonsterRecord['data'];

/**
 * The CR scaler (DESIGN.md §6.2, Beta 8, ADR 0038, ADR 0051), always on show at the top of the
 * monster editor's Challenge section. Two ways in:
 * - Quick: step the CR down or up (or pick one), see each change as old → new, untick any part to
 *   leave it. Every part starts ticked, and the CR follows what is ticked (ADR 0048).
 * - Tune: each part has its own stepper (hit points at CR 6, damage at CR 4, one more attack,
 *   legendary actions on or off), the CR the parts add up to shows live, and Balance moves hit
 *   points (or damage) to land back on the CR picked above.
 * Apply writes to the form; nothing is saved until the editor's Save. The name never changes;
 * the stat block gets a Scaled tag. The editor remounts it (key = CR) whenever the CR changes, so
 * it always starts from the form's CR.
 */
const PART_LABEL: Record<ScalePart, string> = {
  hp: 'Hit points',
  ac: 'Armor class',
  attack: 'Attack bonuses',
  dc: 'Save DCs',
  damage: 'Damage',
  proficiency: 'Saving throws and skills',
  attacks: 'Multiattack',
  legendary: 'Legendary actions',
  area: 'Area attack',
};
const ALL = new Set<ScalePart>(SCALE_PARTS);

function offerLabel(part: ScalePart, offer: string | null): string {
  if (part === 'attacks') return offer === 'add' ? 'Add attacks' : 'Remove attacks';
  if (part === 'legendary') {
    return offer === 'add' ? 'Add legendary actions' : 'Remove legendary actions';
  }
  if (part === 'area') return 'Add an area attack';
  return PART_LABEL[part];
}

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
  const [mode, setMode] = useState<'quick' | 'tune'>('quick');
  const [skipped, setSkipped] = useState<Set<ScalePart>>(new Set());
  // Tune mode's plan; null until the DM moves something, so it follows the CR picked above.
  const [tuned, setTuned] = useState<TunePlan | null>(null);
  const [lastMoved, setLastMoved] = useState<LevelPart | null>(null);

  const parts = useMemo(
    () => new Set<ScalePart>(SCALE_PARTS.filter((p) => !skipped.has(p))),
    [skipped],
  );
  const options = useMemo(() => tuneOptions(data), [data]);
  // Tune starts from what quick scale would do for the CR picked above.
  const plan = useMemo(() => tuned ?? planFor(data, toCr, ALL), [tuned, data, toCr]);
  // Every line on offer (all parts), and the result of only the ticked ones (or the tuned plan).
  const offered = useMemo(() => scaleCr(data, toCr, ALL, name), [data, toCr, name]);
  const result = useMemo(
    () => (mode === 'tune' && plan ? tuneCr(data, plan, name) : scaleCr(data, toCr, parts, name)),
    [mode, plan, data, toCr, parts, name],
  );
  const same = toCr === data.cr;
  const changed = result.lines.length > 1;
  const open = !same || mode === 'tune';

  const at = CR_ORDER.indexOf(toCr as (typeof CR_ORDER)[number]);
  const pick = (cr: string) => {
    setToCr(cr);
    setSkipped(new Set());
    setTuned(null);
    setLastMoved(null);
  };
  const reset = () => {
    pick(data.cr);
    setMode('quick');
  };
  const tune = (next: TunePlan, moved?: LevelPart) => {
    setTuned(next);
    if (moved) setLastMoved(moved);
  };

  const byPart = new Map<ScalePart, ScaleLine[]>();
  for (const line of (mode === 'tune' ? result : offered).lines) {
    if (line.part === 'cr') continue;
    byPart.set(line.part, [...(byPart.get(line.part) ?? []), line]);
  }
  // The CR the parts add up to, which leaves the target as parts are left out or tuned.
  const crLine = result.lines.find((l) => l.part === 'cr');
  const short = result.cr !== toCr;
  const toggle = (part: ScalePart, on: boolean) => {
    setSkipped((s) => {
      const next = new Set(s);
      if (on) next.delete(part);
      else next.add(part);
      return next;
    });
  };
  // Balance with hit points, unless hit points were the last thing moved: then with damage.
  const balanceBy: LevelPart = lastMoved === 'hp' ? 'damage' : 'hp';

  const lineList = (part: ScalePart, muted = false) => {
    const lines = byPart.get(part);
    if (!lines) return null;
    return (
      <ul className="cr-scale-lines">
        {lines.map((l, i) => (
          <li key={i} className={muted ? 'muted' : undefined}>
            {part === 'damage' || l.label !== PART_LABEL[part] ? `${l.label}: ` : ''}
            {l.from} → {l.to}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div
      className={`cr-scale${open ? ' open' : ''}`}
      role="group"
      aria-label="Scale to another CR"
      data-testid="cr-scale"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          reset();
        }
      }}
    >
      <div className="cr-scale-head">
        <Icon name="sliders" />
        <strong>Scale to another CR</strong>
        <span className="seg" role="group" aria-label="Scaler mode">
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'quick'}
            onClick={() => setMode('quick')}
          >
            Quick
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'tune'}
            title="Set each part on its own"
            onClick={() => setMode('tune')}
          >
            Tune
          </button>
        </span>
        <span className="cr-scale-stepper">
          <button
            type="button"
            className="btn"
            aria-label="One CR lower"
            title="One CR lower"
            disabled={at === 0}
            onClick={() => pick(stepCr(toCr, -1))}
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
            onClick={() => pick(stepCr(toCr, 1))}
          >
            <Icon name="plus" />
          </button>
        </span>
      </div>
      {!open ? (
        <p className="muted small">
          Moves hit points, armor class, attack bonuses, save DCs and damage together, by how much a
          typical monster’s change between the two CRs. Tune sets each part on its own. You see
          every change before it is applied.
        </p>
      ) : (
        <>
          <p className="muted small">
            {mode === 'quick'
              ? 'Damage keeps its dice size and adds or drops dice. Untick anything to leave it as it is.'
              : 'Each part moves only when you move it, and the challenge shows what they add up to. Balance is the only thing that adjusts for you: it brings the challenge back to the CR picked above.'}{' '}
            The name stays the same; the stat block shows a Scaled tag.
          </p>
          {crLine && (
            <p data-testid="cr-scale-cr">
              <strong>Challenge</strong> {crLine.from} → {crLine.to}
              {short && (
                <span className="muted small" data-testid="cr-scale-short">
                  {' '}
                  ·{' '}
                  {mode === 'quick' ? `CR ${toCr} with everything ticked` : `aiming for CR ${toCr}`}
                </span>
              )}
            </p>
          )}
          {mode === 'quick' ? (
            <ul className="books-list cr-scale-list">
              {[...byPart.keys()].map((part) => {
                const on = !skipped.has(part);
                const offer =
                  part === 'attacks' || part === 'legendary' || part === 'area'
                    ? offered.offers[part]
                    : null;
                return (
                  <li key={part}>
                    <label>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(part, e.target.checked)}
                      />
                      <strong>{offerLabel(part, offer)}</strong>
                    </label>
                    {lineList(part, !on)}
                  </li>
                );
              })}
            </ul>
          ) : (
            plan && (
              <ul className="books-list cr-scale-list cr-tune" data-testid="cr-tune">
                {LEVEL_PARTS.map((part) => (
                  <li key={part}>
                    <div className="cr-tune-row">
                      <strong>{PART_LABEL[part]}</strong>
                      <span className="muted small">at CR {plan.levels[part]}</span>
                      <span className="cr-tune-step">
                        <button
                          type="button"
                          className="chrome-btn xs"
                          aria-label={`Lower ${PART_LABEL[part].toLowerCase()}`}
                          title="One CR lower"
                          disabled={plan.levels[part] === CR_ORDER[0]}
                          onClick={() =>
                            tune(
                              {
                                ...plan,
                                levels: { ...plan.levels, [part]: stepCr(plan.levels[part], -1) },
                              },
                              part,
                            )
                          }
                        >
                          <Icon name="minus" />
                        </button>
                        <button
                          type="button"
                          className="chrome-btn xs"
                          aria-label={`Raise ${PART_LABEL[part].toLowerCase()}`}
                          title="One CR higher"
                          disabled={plan.levels[part] === CR_ORDER[CR_ORDER.length - 1]}
                          onClick={() =>
                            tune(
                              {
                                ...plan,
                                levels: { ...plan.levels, [part]: stepCr(plan.levels[part], 1) },
                              },
                              part,
                            )
                          }
                        >
                          <Icon name="plus" />
                        </button>
                      </span>
                    </div>
                    {lineList(part)}
                  </li>
                ))}
                {options.canAttack && (
                  <li>
                    <div className="cr-tune-row">
                      <strong>Attacks per turn</strong>
                      <span className="muted small">{plan.attacks}</span>
                      <span className="cr-tune-step">
                        <button
                          type="button"
                          className="chrome-btn xs"
                          aria-label="One attack fewer"
                          title="One attack fewer"
                          disabled={plan.attacks <= 1}
                          onClick={() => tune({ ...plan, attacks: plan.attacks - 1 })}
                        >
                          <Icon name="minus" />
                        </button>
                        <button
                          type="button"
                          className="chrome-btn xs"
                          aria-label="One attack more"
                          title="One attack more"
                          disabled={plan.attacks >= MAX_ATTACKS}
                          onClick={() => tune({ ...plan, attacks: plan.attacks + 1 })}
                        >
                          <Icon name="plus" />
                        </button>
                      </span>
                    </div>
                    {lineList('attacks')}
                  </li>
                )}
                {(options.hasLegendary || options.canAttack) && (
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={plan.legendary}
                        onChange={(e) => tune({ ...plan, legendary: e.target.checked })}
                      />
                      <strong>Legendary actions</strong>
                    </label>
                    {lineList('legendary')}
                  </li>
                )}
                {!options.hasArea && options.canAttack && (
                  <li>
                    <label>
                      <input
                        type="checkbox"
                        checked={plan.area}
                        onChange={(e) => tune({ ...plan, area: e.target.checked })}
                      />
                      <strong>Area attack</strong>
                    </label>
                    {lineList('area')}
                  </li>
                )}
              </ul>
            )
          )}
          {offered.notes.length > 0 && (
            <p className="muted small" data-testid="cr-scale-notes">
              {offered.notes.join(' ')}
            </p>
          )}
          <div className="books-panel-foot">
            <button type="button" className="btn" onClick={reset}>
              Keep CR {data.cr || '—'}
            </button>
            {mode === 'tune' && plan && short && (
              <button
                type="button"
                className="btn"
                title={`Moves ${PART_LABEL[balanceBy].toLowerCase()} to land on CR ${toCr}`}
                onClick={() => tune(balancePlan(data, plan, balanceBy, name))}
              >
                Balance with {PART_LABEL[balanceBy].toLowerCase()}
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              disabled={!changed}
              onClick={() => onApply(result.monster)}
            >
              Apply CR {result.cr} to the form
            </button>
          </div>
        </>
      )}
    </div>
  );
}

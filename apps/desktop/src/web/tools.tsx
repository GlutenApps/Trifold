import { useEffect, useState, type ReactNode } from 'react';
import type { CreatureView, TableIntent } from '@trifold/api';
import { rulerLabel } from '../renderer/features/presenter/ruler';
import { capitalise } from './AddCompanion';
import { Portrait } from './Portrait';

/**
 * The player page's shared pieces and four tools (player UI handoff, 2026-11-15): Health,
 * Conditions, Companions and Move, each working on the creature picked in its target chips.
 */

export type Tool = 'health' | 'conditions' | 'companions' | 'move';

export const TOOLS: ReadonlyArray<{ id: Tool; label: string }> = [
  { id: 'health', label: 'Health' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'companions', label: 'Companions' },
  { id: 'move', label: 'Move' },
];

/** The 14 SRD conditions a player can toggle; Exhaustion has its own stepper. */
const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

export const creatureKey = (c: Pick<CreatureView, 'kind' | 'id'>) => `${c.kind}:${c.id}`;

export type Send = (creature: CreatureView, intent: TableIntent) => void;

/** HP as a share of max and its band: green above half, amber above a quarter, else red. */
export function hpBand(c: CreatureView): { pct: number; band: 'ok' | 'warn' | 'low' } {
  const hp = c.hp;
  const ratio = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  return { pct: Math.round(ratio * 100), band: ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'warn' : 'low' };
}

/** Conditions as text: names, exhaustion with its level. */
export function conditionText(c: CreatureView): string {
  return c.conditions.map((x) => (x.level ? `${x.name} ${x.level}` : x.name)).join(', ');
}

const short = (name: string) => name.split(/\s+/)[0] ?? name;

export function ToolIcon({ tool }: { tool: Tool }) {
  const d = {
    health: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
    conditions: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    // The console's companion mark (icons.tsx), so both ends of the table use one sign.
    companions:
      'M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 20.5a6.5 6.5 0 0 1 13 0M18.5 2.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z',
    move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  }[tool];
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** The four tool buttons. `toggles`: a second tap on the open tool closes it (phone layouts). */
export function ToolTabs({
  open,
  onPick,
  conditionCount,
  className,
}: {
  open: Tool | null;
  onPick(tool: Tool): void;
  conditionCount: number;
  className: string;
}) {
  return (
    <nav className={className} aria-label="Character tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`pc-tooltab${open === t.id ? ' on' : ''}`}
          aria-pressed={open === t.id}
          onClick={() => onPick(t.id)}
        >
          <span className="pc-tooltab-icon">
            <ToolIcon tool={t.id} />
            {t.id === 'conditions' && conditionCount > 0 && (
              <span className="pc-badge" aria-label={`${conditionCount} active`}>
                {conditionCount}
              </span>
            )}
          </span>
          <span className="pc-tooltab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** The character summary: portrait, name, conditions, HP bar, temp and AC. */
export function Summary({
  creature,
  onClick,
  variant,
}: {
  creature: CreatureView;
  onClick?: () => void;
  variant: 'strip' | 'card';
}) {
  const { pct, band } = hpBand(creature);
  const hp = creature.hp;
  const conds = conditionText(creature);
  const body = (
    <>
      <Portrait url={creature.portraitUrl} name={creature.name} size={40} />
      <span className="pc-sum-text">
        <span className="pc-sum-name">{creature.name}</span>
        <span className={`pc-sum-conds${conds ? ' active' : ''}`}>{conds || 'No conditions'}</span>
      </span>
      <span className="pc-sum-hp">
        <span className="pc-sum-hpnum">
          {hp ? hp.current : '—'}
          {hp && <span className="pc-of"> / {hp.max}</span>}
          {hp && hp.temp > 0 && <span className="pc-temp-ink"> +{hp.temp}</span>}
        </span>
        {hp && (
          <span className="pc-bar" aria-hidden="true">
            <span className={band} style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      <span className="pc-ac" aria-label={`AC ${creature.ac ?? 'unknown'}`}>
        <span>AC</span>
        <strong>{creature.ac ?? '—'}</strong>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={`pc-summary ${variant}`}
        aria-label={`${creature.name}, open health`}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }
  return <div className={`pc-summary ${variant}`}>{body}</div>;
}

/** The creatures a tool can work on: the character first, then each companion in play. */
export function TargetChips({
  targets,
  selected,
  onPick,
}: {
  targets: readonly CreatureView[];
  selected: string;
  onPick(key: string): void;
}) {
  if (targets.length < 2) return null;
  return (
    <div className="pc-targets" role="group" aria-label="Which creature">
      {targets.map((c) => (
        <button
          key={creatureKey(c)}
          type="button"
          className={`pc-target${creatureKey(c) === selected ? ' on' : ''}`}
          aria-pressed={creatureKey(c) === selected}
          onClick={() => onPick(creatureKey(c))}
        >
          {short(c.name)}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  children,
}: {
  label: string;
  value: number;
  onChange(n: number): void;
  min: number;
  max: number;
  children?: ReactNode;
}) {
  return (
    <div className="pc-stepper">
      <button
        type="button"
        className="pc-step"
        aria-label={`Lower ${label}`}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      {children ?? <span className="pc-step-value">{value}</span>}
      <button
        type="button"
        className="pc-step"
        aria-label={`Raise ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </div>
  );
}

/** Health: current, max (and AC, which players could change before the redesign too). */
export function HealthTool({ creature, send }: { creature: CreatureView; send: Send }) {
  const [tab, setTab] = useState<'current' | 'max' | 'ac'>('current');
  const [amount, setAmount] = useState(5);
  const hp = creature.hp;
  const [maxDraft, setMaxDraft] = useState(hp?.max ?? 1);
  const [acDraft, setAcDraft] = useState(creature.ac ?? 10);
  useEffect(() => {
    setMaxDraft(hp?.max ?? 1);
    setAcDraft(creature.ac ?? 10);
    // A new target or a change from elsewhere resets the drafts.
  }, [creature.id, hp?.max, creature.ac]);
  const { pct, band } = hpBand(creature);
  if (!hp) return <p className="pc-hint">Your DM keeps this creature’s HP.</p>;
  const editable = creature.editable;
  return (
    <div className="pc-tool-health">
      <div className="pc-hprow">
        <span className="pc-hpbig">{hp.current}</span>
        <span className="pc-of">/ {hp.max}</span>
        <span className="pc-bar wide" aria-hidden="true">
          <span className={band} style={{ width: `${pct}%` }} />
        </span>
        <span className="pc-chip temp">Temp {hp.temp}</span>
      </div>
      {(editable.maxHp || editable.ac) && (
        <div className="pc-segment" role="group" aria-label="What to change">
          <button type="button" aria-pressed={tab === 'current'} onClick={() => setTab('current')}>
            Current HP
          </button>
          {editable.maxHp && (
            <button type="button" aria-pressed={tab === 'max'} onClick={() => setTab('max')}>
              Max HP
            </button>
          )}
          {editable.ac && (
            <button type="button" aria-pressed={tab === 'ac'} onClick={() => setTab('ac')}>
              AC
            </button>
          )}
        </div>
      )}
      {tab === 'current' && (
        <>
          <Stepper label="amount" value={amount} onChange={setAmount} min={0} max={999}>
            <input
              className="pc-amount"
              inputMode="numeric"
              aria-label="Amount"
              value={amount}
              onChange={(e) => {
                const v = parseInt(e.target.value.replace(/\D/g, '') || '0', 10);
                setAmount(Math.min(999, v));
              }}
            />
          </Stepper>
          <div className="pc-hpactions">
            <button
              type="button"
              className="pc-btn damage"
              disabled={!editable.hp || amount < 1}
              onClick={() => send(creature, { kind: 'hp', delta: -amount })}
            >
              Damage
            </button>
            <button
              type="button"
              className="pc-btn heal"
              disabled={!editable.hp || amount < 1}
              onClick={() => send(creature, { kind: 'hp', delta: amount })}
            >
              Heal
            </button>
            <button
              type="button"
              className="pc-btn temp"
              aria-label="Set temp HP"
              disabled={!editable.hp}
              onClick={() => send(creature, { kind: 'setTemp', value: amount })}
            >
              Temp
            </button>
          </div>
        </>
      )}
      {tab === 'max' && (
        <>
          <Stepper label="max HP" value={maxDraft} onChange={setMaxDraft} min={1} max={999} />
          <button
            type="button"
            className="pc-btn primary"
            onClick={() => {
              send(creature, { kind: 'maxHp', value: maxDraft });
              setTab('current');
            }}
          >
            Save max HP
          </button>
        </>
      )}
      {tab === 'ac' && (
        <>
          <Stepper label="AC" value={acDraft} onChange={setAcDraft} min={0} max={40} />
          <button
            type="button"
            className="pc-btn primary"
            onClick={() => {
              send(creature, { kind: 'ac', value: acDraft });
              setTab('current');
            }}
          >
            Save AC
          </button>
        </>
      )}
    </div>
  );
}

/** Conditions: the 14 toggles and an Exhaustion stepper, during a fight. */
export function ConditionsTool({ creature, send }: { creature: CreatureView; send: Send }) {
  const note = <p className="pc-hint small">Conditions are tracked during fights.</p>;
  if (!creature.editable.conditions) return note;
  const exhaustion = creature.conditions.find((c) => c.name === 'Exhaustion');
  const level = exhaustion?.level ?? (exhaustion ? 1 : 0);
  const setLevel = (next: number) => {
    if (next === level) return;
    if (next === 0 && exhaustion) send(creature, { kind: 'removeCondition', id: exhaustion.id });
    // The tracker keeps one Exhaustion and replaces its level.
    else if (next > 0) send(creature, { kind: 'addCondition', name: 'Exhaustion', level: next });
  };
  return (
    <div className="pc-tool-conditions">
      <div className="pc-condgrid">
        {CONDITIONS.map((name) => {
          const active = creature.conditions.find((c) => c.name === name);
          return (
            <button
              key={name}
              type="button"
              className={`pc-cond${active ? ' on' : ''}`}
              aria-pressed={!!active}
              onClick={() =>
                send(
                  creature,
                  active
                    ? { kind: 'removeCondition', id: active.id }
                    : { kind: 'addCondition', name },
                )
              }
            >
              {name}
            </button>
          );
        })}
        <div className="pc-exhaustion">
          <span>Exhaustion</span>
          <Stepper label="exhaustion" value={level} onChange={setLevel} min={0} max={6} />
        </div>
      </div>
      {note}
    </div>
  );
}

/** Companions in play, with Remove confirmed in the row. Adding arrives with summoning. */
export function CompanionsTool({
  companions,
  onRemove,
  footer,
}: {
  companions: readonly CreatureView[];
  onRemove(c: CreatureView): void;
  footer?: ReactNode;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <div className="pc-tool-companions">
      <div className="pc-tool-title">
        <span>Companions in play</span>
        <span className="pc-count">{companions.length}</span>
      </div>
      {companions.map((c) => {
        const key = creatureKey(c);
        const asking = confirming === key;
        return (
          <div key={key} className={`pc-comp${asking ? ' confirming' : ''}`}>
            <div className="pc-comp-row">
              <Portrait url={c.portraitUrl} name={c.name} size={36} />
              <span className="pc-comp-text">
                <span className="pc-comp-name">{c.name}</span>
                <span className="pc-comp-meta">
                  {c.summon ? capitalise(c.summon.type) || 'Summon' : 'Companion'}, AC {c.ac ?? '—'}
                  , HP {c.hp ? `${c.hp.current} / ${c.hp.max}` : '—'}
                </span>
              </span>
              {!asking && (
                <button
                  type="button"
                  className="pc-btn ghost danger-ink"
                  aria-label={`Remove ${c.name} from play`}
                  onClick={() => setConfirming(key)}
                >
                  Remove
                </button>
              )}
            </div>
            {asking && (
              <div className="pc-comp-confirm">
                <span>Take {c.name} out of play? Your DM keeps the creature.</span>
                <button type="button" className="pc-btn" onClick={() => setConfirming(null)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="pc-btn damage"
                  onClick={() => {
                    setConfirming(null);
                    onRemove(c);
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      {companions.length === 0 && (
        <p className="pc-hint center">
          No companions in play. Add a familiar, mount or summon your character controls.
        </p>
      )}
      {footer}
    </div>
  );
}

/**
 * Move: which token, and how. The map does the moving; a move waits for Done (Cancel puts the
 * token back). `onCancel` and `onDone` are given where the buttons sit in the panel; on a phone in
 * portrait they float over the map instead.
 */
export function MoveTool({
  creature,
  planSquares,
  sending,
  onCancel,
  onDone,
  closes = false,
  measuring = false,
  measureSquares = null,
  onMeasuring,
  onClearMeasure,
}: {
  creature: CreatureView;
  /** Squares the planned move covers, or null with no plan. */
  planSquares: number | null;
  sending: boolean;
  onCancel?: () => void;
  onDone?: () => void;
  /** The buttons also close Move (a phone in portrait), so they work with no plan too. */
  closes?: boolean;
  /** Measure is on: a drag on the map measures on this phone only, and moves nothing. */
  measuring?: boolean;
  /** Squares the measurement covers, or null with none drawn. */
  measureSquares?: number | null;
  onMeasuring?: (on: boolean) => void;
  onClearMeasure?: () => void;
}) {
  // Move is the default; Measure is for checking distances, never seen on the TV or the DM's map.
  const modes = onMeasuring && (
    <div className="pc-segment" role="group" aria-label="Move or measure">
      <button type="button" aria-pressed={!measuring} onClick={() => onMeasuring(false)}>
        Move
      </button>
      <button type="button" aria-pressed={measuring} onClick={() => onMeasuring(true)}>
        Measure
      </button>
    </div>
  );
  if (measuring) {
    return (
      <div className="pc-tool-move">
        {modes}
        <p className="pc-move-hint" data-testid="pc-measure-hint">
          {measureSquares
            ? `${rulerLabel(measureSquares)}. Only you see this.`
            : 'Drag on the map to measure. Only you see it.'}
        </p>
        {onClearMeasure && (
          <div className="pc-row pc-move-actions">
            <button
              type="button"
              className="pc-btn"
              disabled={!measureSquares}
              onClick={onClearMeasure}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    );
  }
  if (creature.movementLocked) {
    if (modes) {
      return (
        <div className="pc-tool-move">
          {modes}
          <p className="pc-locked">Movement locked by the DM</p>
        </div>
      );
    }
    return <p className="pc-locked">Movement locked by the DM</p>;
  }
  if (!creature.tokenId) {
    return (
      <div className="pc-tool-move">
        {modes}
        <p className="pc-hint">{creature.name} isn’t on the map right now.</p>
      </div>
    );
  }
  return (
    <div className="pc-tool-move">
      {modes}
      <p className="pc-move-hint">
        {sending
          ? 'Moving…'
          : planSquares !== null
            ? `${rulerLabel(planSquares)}. Drag again to adjust, then Done.`
            : 'Drag the token, or tap where it should go.'}
      </p>
      {onDone && onCancel && (
        <div className="pc-row pc-move-actions">
          <button
            type="button"
            className="pc-btn"
            disabled={sending || (planSquares === null && !closes)}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pc-btn primary"
            disabled={sending || (planSquares === null && !closes)}
            onClick={onDone}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

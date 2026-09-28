import {
  POOL_DICE,
  poolIsEmpty,
  poolIsSingleD20,
  poolLabel,
  useDicePoolStore,
} from '../../stores/dicePoolStore';
import { useRollLogStore } from '../../stores/rollLogStore';

interface DicePoolProps {
  /** The tray-bar form: die chips, Roll and the last total in one row. */
  compact?: boolean;
}

/**
 * Click dice to build a pool (each click adds one; right-click takes one away), set a modifier,
 * then Roll. The pool is shared app-wide, so the panel, the drawer and the tray bar agree.
 */
export function DicePool({ compact = false }: DicePoolProps) {
  const counts = useDicePoolStore((s) => s.counts);
  const modifier = useDicePoolStore((s) => s.modifier);
  const mode = useDicePoolStore((s) => s.mode);
  const add = useDicePoolStore((s) => s.add);
  const remove = useDicePoolStore((s) => s.remove);
  const bumpModifier = useDicePoolStore((s) => s.bumpModifier);
  const setModifier = useDicePoolStore((s) => s.setModifier);
  const setMode = useDicePoolStore((s) => s.setMode);
  const clear = useDicePoolStore((s) => s.clear);
  const roll = useDicePoolStore((s) => s.roll);
  const last = useRollLogStore((s) => s.entries[0] ?? null);
  const pool = { counts, modifier, mode };
  const empty = poolIsEmpty(pool);
  const label = poolLabel(pool);
  const suffix = compact ? ' (tray)' : '';

  const dice = POOL_DICE.map((d) => (
    <button
      key={d}
      type="button"
      className={`die-chip${counts[d] > 0 ? ' in-pool' : ''}`}
      aria-label={`Add d${d}${suffix}`}
      title={`Click to add a d${d}; right-click to take one away`}
      onClick={() => add(d)}
      onContextMenu={(e) => {
        e.preventDefault();
        remove(d);
      }}
    >
      <span className="die-face">d{d}</span>
      {counts[d] > 0 && (
        <span className="die-count" aria-label={`${counts[d]} in pool`}>
          {counts[d]}
        </span>
      )}
    </button>
  ));

  if (compact) {
    return (
      <div className="dice-pool compact" data-testid="dice-pool-compact">
        {dice}
        <button
          type="button"
          className="btn small primary"
          aria-label="Roll the pool (tray)"
          disabled={empty}
          title={label || 'Add dice first'}
          onClick={() => roll()}
        >
          Roll
        </button>
        {!empty && (
          <button
            type="button"
            className="chrome-btn"
            aria-label="Clear the pool (tray)"
            onClick={clear}
            title="Clear"
          >
            ×
          </button>
        )}
        <output className="tray-result" aria-label="Last roll" title={last?.label}>
          {last ? last.total : '–'}
        </output>
      </div>
    );
  }

  return (
    <div className="dice-pool" data-testid="dice-pool">
      <div className="die-row">{dice}</div>
      <div className="row pool-controls">
        <span className="pool-modifier" role="group" aria-label="Modifier">
          <button
            type="button"
            className="chrome-btn"
            aria-label="Modifier down"
            onClick={() => bumpModifier(-1)}
          >
            −
          </button>
          <input
            type="number"
            aria-label="Modifier"
            className="narrow"
            value={modifier}
            onChange={(e) => setModifier(Number(e.target.value))}
          />
          <button
            type="button"
            className="chrome-btn"
            aria-label="Modifier up"
            onClick={() => bumpModifier(1)}
          >
            +
          </button>
        </span>
        <span className="seg" role="group" aria-label="Roll mode">
          {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="btn small"
              aria-pressed={mode === m}
              disabled={m !== 'normal' && !poolIsSingleD20(pool)}
              title={m === 'normal' ? undefined : 'Applies to a single d20'}
              onClick={() => setMode(m)}
            >
              {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Adv' : 'Dis'}
            </button>
          ))}
        </span>
        <span className="spacer" />
        <button type="button" className="btn" disabled={empty} onClick={clear}>
          Clear
        </button>
        <button
          type="button"
          className="btn primary roll-btn"
          aria-label="Roll the pool"
          disabled={empty}
          onClick={() => roll()}
        >
          Roll {label ? <span className="pool-label">{label}</span> : null}
        </button>
      </div>
      <div className="pool-result" aria-live="polite">
        {last ? (
          <>
            <span className="pool-total">{last.total}</span>
            <span className="muted">
              {last.label} · {last.faces}
            </span>
          </>
        ) : (
          <span className="muted">Pick some dice and roll.</span>
        )}
      </div>
    </div>
  );
}

import {
  POOL_DICE,
  poolIsEmpty,
  poolIsSingleD20,
  poolLabel,
  useDicePoolStore,
} from '../../stores/dicePoolStore';
import { useRollLogStore } from '../../stores/rollLogStore';
import { Icon } from '../shell/icons';
import { RollReveal, useRollReveal } from './RollReveal';

/**
 * The shared dice pool as chips and a Roll button (DESIGN.md §6.7). It has two homes with
 * different accessible names (ADR 0009): the full version inside the Dice pop-up, and the
 * compact version at the right end of the live strip. Both edit the one pool store, so a die
 * added in either rolls from the other.
 */

interface DicePoolProps {
  /** The tray-bar form: die chips, Roll and the last total in one row. */
  compact?: boolean;
}

/**
 * Click dice to build a pool (each click adds one; right-click takes one away), set a modifier,
 * then Roll. The pool is shared app-wide, so the Dice pop-up and the strip's compact pool agree.
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
  const reveal = useRollReveal(last);
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
    // Right end of the strip: last total, the chips, Clear, then Roll next to the Dice button.
    return (
      <div className="dice-pool compact" data-testid="dice-pool-compact">
        <output className="tray-result" aria-label="Last roll" title={last?.label}>
          <RollReveal entry={last} reveal={reveal} />
        </output>
        {dice}
        {/* Always in the row so the chips never shift when it appears; hidden while empty. */}
        <button
          type="button"
          className="chrome-btn tray-clear"
          aria-label="Clear the pool (tray)"
          disabled={empty}
          aria-hidden={empty}
          onClick={clear}
          title="Clear the pool"
        >
          <Icon name="close" />
        </button>
        <button
          type="button"
          className="btn primary"
          aria-label="Roll the pool (tray)"
          disabled={empty}
          title={label || 'Add dice first'}
          onClick={() => roll()}
        >
          Roll
        </button>
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
            title="Modifier down"
            onClick={() => bumpModifier(-1)}
          >
            <Icon name="minus" />
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
            title="Modifier up"
            onClick={() => bumpModifier(1)}
          >
            <Icon name="plus" />
          </button>
        </span>
        <span className="seg" role="group" aria-label="Roll mode">
          {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="btn"
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
      </div>
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
  );
}

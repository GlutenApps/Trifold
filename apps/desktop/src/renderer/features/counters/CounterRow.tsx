import { useRef, useState, type KeyboardEvent } from 'react';
import { bigStep, canAdjust, counterBound, parseWhole, type CounterBound } from '@trifold/rules';
import type { CampaignCounter } from '@trifold/schema';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * One counter (ADR 0019), drawn from its data and nothing else: the name and its row actions
 * (show on TV, reset, edit, delete) on the first line, the buttons and the value on the second:
 * the step either side of the value, and the alternate step outside those when the counter has
 * one; its range, when it has bounds, on a third. Row actions are always there, quiet until the
 * row is hovered or focused (ADR 0020); the TV button lights while the counter is on the TV. It owns only what is on screen for a moment (typing a value, the delete confirm); every
 * change goes out through the callbacks.
 *
 * Keys act while focus is anywhere in the row: ↑/↓ the step, Shift+↑/↓ and PageUp/PageDown the
 * alternate step (the step when there is none), Home/End jump to a set bound. There is no wheel:
 * a DM scrolling another panel must never change a counter that happens to have focus.
 */

export interface CounterFlash {
  bound: CounterBound;
  /** Bumped on every hit, so the same bound flashes again. */
  n: number;
}

export interface CounterRowProps {
  counter: CampaignCounter;
  /** The bound the last change ran into, while it is flashing. */
  flash: CounterFlash | null;
  onAdjust(delta: number): void;
  onSet(value: number): void;
  onReset(): void;
  onEdit(): void;
  onDelete(): void;
  /** Puts the counter on the TV or takes it off. */
  onToggleTv(): void;
  /** False when the TV already shows its three and this counter is not one of them. */
  canShowOnTv: boolean;
  /** Drag-to-reorder props and the class with the drop hint. */
  dragProps?: Record<string, unknown>;
  dragClass?: string;
}

export function CounterRow({
  counter,
  flash,
  onAdjust,
  onSet,
  onReset,
  onEdit,
  onDelete,
  onToggleTv,
  canShowOnTv,
  dragProps,
  dragClass = '',
}: CounterRowProps) {
  const [typing, setTyping] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const valueRef = useRef<HTMLButtonElement>(null);
  const bound = counterBound(counter);
  const { name, step, altStep, value } = counter;
  const big = bigStep(counter);
  const onTv = !!counter.showOnTv;

  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target instanceof HTMLInputElement || confirming) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    let delta: number | null = null;
    if (e.key === 'ArrowUp') delta = e.shiftKey ? big : step;
    else if (e.key === 'ArrowDown') delta = e.shiftKey ? -big : -step;
    else if (e.key === 'PageUp') delta = big;
    else if (e.key === 'PageDown') delta = -big;
    if (delta !== null) {
      e.preventDefault();
      e.stopPropagation();
      onAdjust(delta);
      return;
    }
    if (e.key === 'Home' && counter.min !== undefined) {
      e.preventDefault();
      onSet(counter.min);
    } else if (e.key === 'End' && counter.max !== undefined) {
      e.preventDefault();
      onSet(counter.max);
    }
  };

  // What is typed, also in a ref: the field's blur can arrive after Enter or Escape closed it,
  // and must then do nothing.
  const typed = useRef<string | null>(null);
  const startTyping = () => {
    typed.current = String(value);
    setTyping(typed.current);
  };
  const stopTyping = () => {
    typed.current = null;
    setTyping(null);
    // Focus goes back once the field is gone.
    requestAnimationFrame(() => valueRef.current?.focus());
  };
  const commitTyping = () => {
    if (typed.current === null) return;
    const n = parseWhole(typed.current);
    stopTyping();
    if (n !== null) onSet(n);
  };

  const stepButton = (delta: number) => {
    const size = Math.abs(delta);
    const label = delta > 0 ? `Add ${size} to` : `Take ${size} from`;
    return (
      <button
        type="button"
        className={`btn counter-step${canAdjust(counter, delta > 0 ? 1 : -1) ? '' : ' at-bound'}`}
        aria-label={`${label} ${name}`}
        title={delta > 0 ? `Add ${size}` : `Take ${size}`}
        onClick={() => onAdjust(delta)}
      >
        <Icon name={delta > 0 ? 'plus' : 'minus'} />
        {size}
      </button>
    );
  };

  const boundsText =
    counter.min !== undefined || counter.max !== undefined
      ? `${counter.min ?? '…'} to ${counter.max ?? '…'}`
      : null;

  const tvTitle = onTv
    ? 'Take off the TV'
    : canShowOnTv
      ? 'Show on the TV'
      : 'The TV shows three counters; take one off first';

  return (
    <li
      className={`counter-row${bound ? ` at-${bound}` : ''}${dragClass}`}
      tabIndex={-1}
      aria-label={name}
      data-testid="counter-row"
      onKeyDown={onKeyDown}
      // No dragging while typing, so selecting the typed text never starts a drag.
      {...(typing === null ? dragProps : {})}
    >
      <div className="counter-head">
        <span className="counter-name" title={name}>
          {name}
        </span>
        {confirming ? (
          <InlineConfirm
            name={name}
            onConfirm={() => {
              setConfirming(false);
              onDelete();
            }}
            onKeep={() => {
              setConfirming(false);
              valueRef.current?.focus();
            }}
          />
        ) : (
          <span className="row-actions">
            <button
              type="button"
              className={`chrome-btn xs${onTv ? ' on' : ''}`}
              aria-label={onTv ? `Take ${name} off the TV` : `Show ${name} on the TV`}
              aria-pressed={onTv}
              title={tvTitle}
              disabled={!onTv && !canShowOnTv}
              onClick={onToggleTv}
            >
              <Icon name="tv" />
            </button>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label={`Reset ${name} to ${counter.initial}`}
              title={`Reset to ${counter.initial}`}
              onClick={onReset}
            >
              <Icon name="undo" />
            </button>
            <button
              type="button"
              className="chrome-btn xs"
              aria-label={`Edit ${name}`}
              title="Edit"
              onClick={onEdit}
            >
              <Icon name="pencil" />
            </button>
            <button
              type="button"
              className="chrome-btn xs danger"
              aria-label={`Delete ${name}`}
              title="Delete"
              onClick={() => setConfirming(true)}
            >
              <Icon name="trash" />
            </button>
          </span>
        )}
      </div>
      <div className={`counter-controls${altStep !== undefined ? ' has-alt' : ''}`}>
        {altStep !== undefined && stepButton(-altStep)}
        {stepButton(-step)}
        {typing === null ? (
          <button
            ref={valueRef}
            type="button"
            className="btn counter-value"
            aria-label={`${name}: ${value}${bound ? `, at its ${bound === 'max' ? 'maximum' : 'minimum'}` : ''}. Type a value`}
            title="Click to type a value; the arrow keys change it"
            onClick={startTyping}
          >
            <span
              key={flash?.n ?? 0}
              className={`counter-num${flash ? ` flash-${flash.bound}` : ''}`}
            >
              {value}
            </span>
            {bound && <span className="badge warn counter-badge">{bound}</span>}
          </button>
        ) : (
          <input
            className="counter-input"
            type="text"
            inputMode="numeric"
            aria-label={`New value for ${name}`}
            autoFocus
            value={typing}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              typed.current = e.target.value;
              setTyping(e.target.value);
            }}
            onBlur={commitTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTyping();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                stopTyping();
              }
            }}
          />
        )}
        {stepButton(step)}
        {altStep !== undefined && stepButton(altStep)}
      </div>
      {boundsText && <div className="muted small counter-bounds">{boundsText}</div>}
    </li>
  );
}

import { useEffect, useState } from 'react';
import type { Derived } from '@trifold/rules';
import { Icon } from '../shell/icons';

/**
 * Small inputs the character editors share (ADR 0068): a whole-number field that keeps what is
 * typed until it is a number in range, and a worked-out number the player can override.
 */

/** "+3", "-1", "+0". */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/**
 * A whole number between `min` and `max`. While the text is not one ("", "-") nothing is
 * changed; `optional` lets an empty field mean none.
 */
export function NumField({
  label,
  value,
  min,
  max,
  optional = false,
  onChange,
  className,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  optional?: boolean;
  onChange(next: number | undefined): void;
  className?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    setText((t) =>
      Number(t) === value && t !== '' ? t : value === undefined ? '' : String(value),
    );
  }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      className={`num-field${className ? ` ${className}` : ''}`}
      aria-label={label}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') {
          if (optional) onChange(undefined);
          return;
        }
        const n = Number(t);
        if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
    />
  );
}

/**
 * A number the sheet works out. Typing a different number overrides it; an overridden number
 * says what the sheet gives and has Reset beside it.
 */
export function DerivedField({
  label,
  derived,
  min = -20,
  max = 99,
  showSign = false,
  onOverride,
}: {
  label: string;
  derived: Derived;
  min?: number;
  max?: number;
  /** Shows the value as a bonus (+3) beside the field. */
  showSign?: boolean;
  /** A number to hold, or undefined to go back to what the sheet works out. */
  onOverride(value: number | undefined): void;
}) {
  return (
    <span className={`derived-field${derived.overridden ? ' overridden' : ''}`}>
      <NumField
        label={label}
        value={derived.value}
        min={min}
        max={max}
        onChange={(n) => {
          if (n === undefined) return;
          onOverride(n === derived.base ? undefined : n);
        }}
      />
      {showSign && <span className="muted small derived-sign">{signed(derived.value)}</span>}
      {derived.overridden && (
        <button
          type="button"
          className="chrome-btn xs"
          aria-label={`Reset ${label}`}
          title={`Set by hand. The sheet works out ${derived.base}: reset to it`}
          onClick={() => onOverride(undefined)}
        >
          <Icon name="undo" />
        </button>
      )}
    </span>
  );
}

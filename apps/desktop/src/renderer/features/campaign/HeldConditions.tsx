import { useEffect, useRef, useState } from 'react';
import { ulid } from 'ulid';
import { CONDITION_NAMES, withCondition, withoutCondition } from '@trifold/rules';
import type { ConditionInstance } from '@trifold/schema';
import { Icon } from '../shell/icons';

/**
 * The conditions a PC card or an NPC carries between fights (ADR 0049), on its row in the
 * Campaign tab: one badge each with a remove button, and a plus that opens the list to add one
 * (ADR 0055: a menu, not a dropdown always on screen, so a row stays short). Players change the
 * same list from their phones; in a fight the tracker keeps it instead, and the fight hands it
 * back when it ends.
 */
export function HeldConditions({
  name,
  conditions,
  onChange,
}: {
  name: string;
  conditions: readonly ConditionInstance[] | undefined;
  onChange(next: ConditionInstance[]): void;
}) {
  const list = conditions ?? [];
  const exhaustion = list.find((c) => c.name === 'Exhaustion')?.level ?? 0;
  const add = (condition: string) => {
    if (!condition) return;
    // Exhaustion goes up a level each time it is added, to 6.
    const level =
      condition === 'Exhaustion'
        ? Math.min(6, (list.find((c) => c.name === 'Exhaustion')?.level ?? 0) + 1)
        : undefined;
    onChange(
      withCondition(list, {
        id: ulid(),
        name: condition,
        ...(level ? { level } : {}),
        appliedRound: 0,
      }),
    );
  };
  return (
    <span className="held-conditions" role="group" aria-label={`${name} conditions`}>
      {list.map((c) => (
        <span key={c.id} className="badge warn held-condition">
          {c.name}
          {c.level ? ` ${c.level}` : ''}
          <button
            type="button"
            className="chrome-btn xs"
            aria-label={`Remove ${c.name} from ${name}`}
            title="Remove"
            onClick={() => onChange(withoutCondition(list, c.id))}
          >
            <Icon name="close" />
          </button>
        </span>
      ))}
      <ConditionMenu name={name} exhaustion={exhaustion} onPick={add} />
    </span>
  );
}

/** The plus and its menu of conditions; Exhaustion says which level it adds. */
function ConditionMenu({
  name,
  exhaustion,
  onPick,
}: {
  name: string;
  exhaustion: number;
  onPick(condition: string): void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const label = `Add a condition to ${name}`;
  return (
    <span
      className="menu-anchor"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={`chrome-btn xs${open ? ' on' : ''}`}
        aria-label={label}
        title="Add a condition; it comes into the next fight"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="plus" />
      </button>
      {open && (
        <div className="menu menu-start condition-menu" role="menu" aria-label={label}>
          {CONDITION_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(c);
              }}
            >
              {c === 'Exhaustion' && exhaustion > 0
                ? exhaustion >= 6
                  ? 'Exhaustion (at 6)'
                  : `Exhaustion (to level ${exhaustion + 1})`
                : c}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

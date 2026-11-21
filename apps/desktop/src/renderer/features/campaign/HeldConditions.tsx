import { ulid } from 'ulid';
import { CONDITION_NAMES, withCondition, withoutCondition } from '@trifold/rules';
import type { ConditionInstance } from '@trifold/schema';
import { Icon } from '../shell/icons';

/**
 * The conditions a PC card or an NPC carries between fights (ADR 0049), on its row in the
 * Campaign tab: one badge each with a remove button, and a list to add one. Players change the
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
      <select
        className="held-condition-add"
        aria-label={`Add a condition to ${name}`}
        title="Add a condition; it comes into the next fight"
        value=""
        onChange={(e) => add(e.target.value)}
      >
        <option value="">+ Condition</option>
        {CONDITION_NAMES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </span>
  );
}

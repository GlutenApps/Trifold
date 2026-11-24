import {
  d20Outcome,
  facesText,
  parseRollRequest,
  rollRequest,
  tableRollProblem,
  type RollMode,
} from '@trifold/rules';
import { useRollLogStore } from '../../stores/rollLogStore';
import { tableRollSender, type TableRollExtra } from '../../stores/tableRollStore';

/**
 * Rolling from the sheet (ADR 0075): a save, a skill, initiative, an attack or its damage, rolled
 * the way the Dice pop-up rolls. With **Table** chosen and the player at the table, the GM's
 * Trifold makes the roll and every roll log shows it, named for what it was; otherwise it is made
 * here and logged here. An initiative roll at the table is entered there; made here, its total
 * goes to `onInitiative`.
 */

export interface SheetRollOptions {
  /** Who rolled, as the roll log names them. */
  actor: string;
  mode: RollMode;
  /** An initiative roll: whose initiative, at the table. */
  initiative?: TableRollExtra['initiative'];
  /** A private initiative roll's total, to send as the creature's initiative. */
  onInitiative?(total: number): void;
}

/** A d20 test's expression: "1d20+5", "1d20-1", "1d20". */
export function d20(modifier: number): string {
  return modifier === 0 ? '1d20' : `1d20${modifier > 0 ? '+' : ''}${modifier}`;
}

/** The dice in a damage line ("1d8+3 slashing" → "1d8+3"), or null when it has none. */
export function damageDice(text: string): string | null {
  const m = /\d*d\d+(?:\s*[+-]\s*\d+)?/i.exec(text);
  return m ? m[0].replace(/\s+/g, '') : null;
}

/** Rolls it; returns a problem to show, or null when it rolled or was asked of the table. */
export function rollFromSheet(
  label: string,
  expression: string,
  o: SheetRollOptions,
): string | null {
  const single = /^1?d20([+-]\d+)?$/i.test(expression);
  const text =
    o.mode !== 'normal' && single
      ? `${expression} ${o.mode === 'advantage' ? 'adv' : 'dis'}`
      : expression;
  const toTable = tableRollSender();
  if (toTable) {
    const problem = tableRollProblem(text);
    if (problem) return problem;
    toTable(text, { for: label, ...(o.initiative ? { initiative: o.initiative } : {}) });
    return null;
  }
  const request = parseRollRequest(text);
  if (!request) return `Cannot read "${expression}".`;
  const result = rollRequest(request);
  const modeNote = request.mode === 'normal' ? '' : ` (${request.mode})`;
  const outcome = d20Outcome(result);
  useRollLogStore.getState().add({
    kind: 'dice',
    label: `${label}: ${request.expression}${modeNote}`,
    expression: request.expression,
    total: result.total,
    faces: facesText(result),
    source: 'pool',
    actor: o.actor,
    ...(outcome ? { outcome } : {}),
  });
  o.onInitiative?.(result.total);
  return null;
}

import { parseRollRequest, rollRequest, type D20Roll } from '../combat/rolls';
import type { RollResult, Rng } from '../dice';

/**
 * Table rolls (docs/PLAYER-MODE.md, "Table rolls"; ADR 0059): a player asks for a roll, the GM's
 * Trifold makes it and tells the GM's roll log and every player's. Rolling where the GM is
 * makes a public roll mean something: the app is open source, so a roll made on a player's own
 * machine and claimed as public could be made up.
 */

/** A roll made at the table, as every roll log shows it. */
export interface TableRoll {
  id: string;
  /** When it was rolled, by the GM's clock. */
  at: number;
  /** Who rolled: the name of the character the player holds. */
  by: string;
  /** What the log calls it: the expression, with `(advantage)` or `(disadvantage)`. */
  label: string;
  expression: string;
  total: number;
  /** Faces rolled, as a roll log shows them (`2d6: 4, 2`). */
  faces: string;
  /** A natural 20 or 1 on a lone d20. */
  outcome?: 'crit' | 'fumble';
}

/** A request longer than this is not a roll anyone types. */
export const TABLE_ROLL_MAX_LENGTH = 60;
/** More dice than this in one roll is refused: the faces go to every device at the table. */
export const TABLE_ROLL_MAX_DICE = 100;

/** Faces rolled, formatted for a roll log (`2d6: 4, 2`, kept dice after an arrow). */
export function facesText(result: RollResult): string {
  return result.dice
    .map((d) => {
      const kept = d.kept.length !== d.rolls.length ? ` → ${d.kept.join(', ')}` : '';
      return `${d.term.count}d${d.term.sides}: ${d.rolls.join(', ')}${kept}`;
    })
    .join(' · ');
}

/** Natural 20 or 1 when the roll was a lone d20 (with or without a modifier), else nothing. */
export function d20Outcome(result: RollResult & { d20?: D20Roll }): 'crit' | 'fumble' | undefined {
  const only = result.dice.length === 1 ? result.dice[0] : undefined;
  const natural =
    result.d20?.natural ??
    (only && only.term.sides === 20 && only.term.count === 1 ? only.kept[0] : undefined);
  return natural === 20 ? 'crit' : natural === 1 ? 'fumble' : undefined;
}

/** Whether `text` is a roll the table would make: the check a player's Trifold runs before asking. */
export function tableRollProblem(text: string): string | null {
  if (text.trim().length > TABLE_ROLL_MAX_LENGTH) return 'That roll is too long for the table.';
  if (!parseRollRequest(text)) return `Cannot read "${text.trim().slice(0, 40)}".`;
  return null;
}

/**
 * Makes a roll for the table from what a player sent: the roller's own syntax (`2d6+3`,
 * `4d6kh3`, `d20+5 adv`), held to a length and a number of dice. The result has everything a
 * roll log shows but who rolled and when, which the table server adds.
 */
export function rollForTable(
  text: string,
  rng: Rng = Math.random,
): { ok: true; roll: Omit<TableRoll, 'id' | 'at' | 'by'> } | { ok: false; problem: string } {
  const problem = tableRollProblem(text);
  const request = problem ? null : parseRollRequest(text);
  if (!request) return { ok: false, problem: problem ?? 'Cannot read that roll.' };
  const result = rollRequest(request, rng);
  const dice = result.dice.reduce((n, d) => n + d.rolls.length, 0);
  if (dice > TABLE_ROLL_MAX_DICE) {
    return { ok: false, problem: `The table rolls up to ${TABLE_ROLL_MAX_DICE} dice at once.` };
  }
  const outcome = d20Outcome(result);
  return {
    ok: true,
    roll: {
      label: `${request.expression}${request.mode === 'normal' ? '' : ` (${request.mode})`}`,
      expression: request.expression,
      total: result.total,
      faces: facesText(result),
      ...(outcome ? { outcome } : {}),
    },
  };
}

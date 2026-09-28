import { doubleDice, formatTerms, parseDice, roll, type RollResult, type Rng } from '../dice';

/** d20 tests, attacks and the roller's request syntax (DESIGN.md §6.4, §6.7). */

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface D20Roll {
  /** Every d20 face rolled (two under advantage/disadvantage). */
  faces: number[];
  natural: number;
  modifier: number;
  total: number;
  mode: RollMode;
}

export function rollD20(
  modifier: number,
  mode: RollMode = 'normal',
  rng: Rng = Math.random,
): D20Roll {
  const face = () => 1 + Math.floor(rng() * 20);
  const faces = mode === 'normal' ? [face()] : [face(), face()];
  const natural =
    mode === 'advantage'
      ? Math.max(...faces)
      : mode === 'disadvantage'
        ? Math.min(...faces)
        : faces[0]!;
  return { faces, natural, modifier, total: natural + modifier, mode };
}

export interface AttackRollResult {
  toHit: D20Roll;
  crit: boolean;
  fumble: boolean;
  /** Absent for damage-only attacks (blank to-hit). */
  damage?: RollResult & { crit: boolean };
  extraDamage: Array<RollResult & { damageType?: string }>;
}

export interface AttackInput {
  toHit?: number;
  damage?: string;
  extraDamage?: Array<{ damage: string; damageType?: string }>;
}

/**
 * Rolls to-hit (crit on a natural 20, fumble on a 1) and damage in one go; a crit doubles the
 * dice but not the modifiers. A blank to-hit rolls damage only.
 */
export function rollAttack(
  attack: AttackInput,
  mode: RollMode = 'normal',
  rng: Rng = Math.random,
): AttackRollResult {
  const toHit = rollD20(attack.toHit ?? 0, mode, rng);
  const crit = attack.toHit !== undefined && toHit.natural === 20;
  const fumble = attack.toHit !== undefined && toHit.natural === 1;
  const result: AttackRollResult = { toHit, crit, fumble, extraDamage: [] };
  if (attack.damage) {
    const expression = crit ? formatTerms(doubleDice(parseDice(attack.damage))) : attack.damage;
    result.damage = { ...roll(expression, rng), crit };
  }
  for (const extra of attack.extraDamage ?? []) {
    const expression = crit ? formatTerms(doubleDice(parseDice(extra.damage))) : extra.damage;
    result.extraDamage.push({
      ...roll(expression, rng),
      ...(extra.damageType ? { damageType: extra.damageType } : {}),
    });
  }
  return result;
}

export interface RollRequest {
  expression: string;
  mode: RollMode;
}

/**
 * Roller input (DESIGN.md §6.7): a dice expression optionally followed by `adv` or `dis`
 * (`d20 adv`, `1d20+5 dis`). A bare modifier such as `+5` means `1d20+5`.
 */
export function parseRollRequest(input: string): RollRequest | null {
  let text = input.trim();
  if (!text) return null;
  let mode: RollMode = 'normal';
  const m = /\s+(adv|advantage|dis|disadvantage)$/i.exec(text);
  if (m?.[1]) {
    mode = m[1].toLowerCase().startsWith('adv') ? 'advantage' : 'disadvantage';
    text = text.slice(0, m.index).trim();
  }
  if (/^[+-]\s*\d+$/.test(text)) text = `1d20${text.replace(/\s+/g, '')}`;
  try {
    parseDice(text);
  } catch {
    return null;
  }
  return { expression: text, mode };
}

/** Rolls a request; advantage/disadvantage applies to the d20 term when the expression is a single d20. */
export function rollRequest(
  request: RollRequest,
  rng: Rng = Math.random,
): RollResult & { d20?: D20Roll } {
  const single = /^(?:1)?d20\s*([+-]\s*\d+)?$/i.exec(request.expression.replace(/\s+/g, ''));
  if (request.mode !== 'normal' && single) {
    const modifier = single[1] ? Number(single[1]) : 0;
    const d20 = rollD20(modifier, request.mode, rng);
    return {
      expression: request.expression,
      total: d20.total,
      dice: [
        {
          term: { kind: 'dice', sign: 1, count: d20.faces.length, sides: 20 },
          rolls: d20.faces,
          kept: [d20.natural],
          subtotal: d20.natural,
        },
      ],
      d20,
    };
  }
  return roll(request.expression, rng);
}

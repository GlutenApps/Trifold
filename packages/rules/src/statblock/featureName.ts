/** Feature-name conventions (DATA-FORMATS.md §2.3): uses, recharge, bonus action, variant, cost. */

export type UsesPer = 'day' | 'turn' | 'shortRest' | 'longRest' | 'rest';

export interface ParsedFeatureName {
  displayName: string;
  uses?: { count: number; per: UsesPer };
  recharge?: { min: number; max: 6 };
  cost?: number;
  isBonusAction: boolean;
  isVariant: boolean;
}

const USES = /\s*\((\d+)\/(Day|Turn|Short Rest|Long Rest|Rest)\)/i;
const RECHARGE = /\s*\(Recharge\s*(\d)(?:\s*[–-]\s*(\d))?\)/i;
const BONUS = /\s*\(Bonus Action\)\s*$/i;
const VARIANT = /^Variant:\s*/i;
const COST = /\s*\(Costs (\d) Actions?\)/i;

const PER: Record<string, UsesPer> = {
  day: 'day',
  turn: 'turn',
  'short rest': 'shortRest',
  'long rest': 'longRest',
  rest: 'rest',
};

export function parseFeatureName(raw: string): ParsedFeatureName {
  let name = raw.trim();
  const result: ParsedFeatureName = { displayName: name, isBonusAction: false, isVariant: false };

  if (BONUS.test(name)) {
    result.isBonusAction = true;
    name = name.replace(BONUS, '');
  }
  if (VARIANT.test(name)) {
    result.isVariant = true;
    name = name.replace(VARIANT, '');
  }
  const uses = USES.exec(name);
  if (uses?.[1] && uses[2]) {
    const per = PER[uses[2].toLowerCase()];
    if (per) result.uses = { count: Number(uses[1]), per };
    name = name.replace(USES, '');
  }
  const recharge = RECHARGE.exec(name);
  if (recharge?.[1]) {
    const min = Number(recharge[1]);
    if (min >= 1 && min <= 6) result.recharge = { min, max: 6 };
    name = name.replace(RECHARGE, '');
  }
  const cost = COST.exec(name);
  if (cost?.[1]) {
    result.cost = Number(cost[1]);
    name = name.replace(COST, '');
  }

  result.displayName = name.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * `<recharge>` codes: `D4`–`D6`, `1/DAY`, `SHORT`, `3/TURN` (DATA-FORMATS.md §2.3).
 * Returns null for anything unrecognised so the importer can warn.
 */
export function parseRechargeCode(
  code: string,
): { recharge?: { min: number; max: 6 }; uses?: { count: number; per: UsesPer } } | null {
  const text = code.trim().toUpperCase();
  if (!text) return null;
  const d = /^D(\d)$/.exec(text);
  if (d?.[1]) {
    const min = Number(d[1]);
    return min >= 1 && min <= 6 ? { recharge: { min, max: 6 } } : null;
  }
  const per = /^(\d+)\/(DAY|TURN|SHORT|LONG|REST)$/.exec(text);
  if (per?.[1] && per[2]) {
    const map: Record<string, UsesPer> = {
      DAY: 'day',
      TURN: 'turn',
      SHORT: 'shortRest',
      LONG: 'longRest',
      REST: 'rest',
    };
    const kind = map[per[2]];
    return kind ? { uses: { count: Number(per[1]), per: kind } } : null;
  }
  if (text === 'SHORT' || text === 'SHORT REST') return { uses: { count: 1, per: 'shortRest' } };
  if (text === 'LONG' || text === 'LONG REST') return { uses: { count: 1, per: 'longRest' } };
  if (text === 'REST') return { uses: { count: 1, per: 'rest' } };
  return null;
}

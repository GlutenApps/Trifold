/** CR → XP, proficiency by CR, and the 2024 encounter budget (DESIGN.md §7.4–7.5). */

export const CR_ORDER = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
] as const;
export type ChallengeRating = (typeof CR_ORDER)[number];

export const XP_BY_CR: Record<ChallengeRating, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

function isCr(text: string): text is ChallengeRating {
  return (CR_ORDER as readonly string[]).includes(text);
}

/** Accepts `1/8`, `0.5`, `10`, with surrounding whitespace. Returns null for anything else. */
export function normalizeCr(cr: string | number | null | undefined): ChallengeRating | null {
  if (cr === null || cr === undefined) return null;
  const text = String(cr).trim();
  if (isCr(text)) return text;
  const n = Number(text);
  if (text === '' || !Number.isFinite(n)) return null;
  if (n === 0.125) return '1/8';
  if (n === 0.25) return '1/4';
  if (n === 0.5) return '1/2';
  const int = String(n);
  return isCr(int) ? int : null;
}

export function crToNumber(cr: string | number | null | undefined): number | null {
  const norm = normalizeCr(cr);
  if (norm === null) return null;
  if (norm === '1/8') return 0.125;
  if (norm === '1/4') return 0.25;
  if (norm === '1/2') return 0.5;
  return Number(norm);
}

/** XP for a CR. CR 0 creatures with no attacks are worth 0 (DESIGN.md §7.5). */
export function xpForCr(
  cr: string | number | null | undefined,
  options: { hasAttacks?: boolean } = {},
): number | null {
  const norm = normalizeCr(cr);
  if (norm === null) return null;
  if (norm === '0' && options.hasAttacks === false) return 0;
  return XP_BY_CR[norm];
}

export function proficiencyBonusForCr(cr: string | number | null | undefined): number | null {
  const n = crToNumber(cr);
  if (n === null) return null;
  if (n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export interface Budget {
  low: number;
  moderate: number;
  high: number;
}

/** XP budget per character by level, 2024 rules. Verify against the 2024 DMG before release. */
export const ENCOUNTER_BUDGET_2024: Record<number, Budget> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 6400, moderate: 10700, high: 17200 },
  20: { low: 8500, moderate: 13200, high: 22000 },
};

/** Sum of per-character budgets. Levels are clamped to 1–20. No encounter multiplier in 2024. */
export function partyBudget(levels: number[]): Budget {
  const total: Budget = { low: 0, moderate: 0, high: 0 };
  for (const raw of levels) {
    const level = Math.min(20, Math.max(1, Math.round(raw)));
    const row = ENCOUNTER_BUDGET_2024[level];
    if (!row) continue;
    total.low += row.low;
    total.moderate += row.moderate;
    total.high += row.high;
  }
  return total;
}

export type DifficultyBand = 'trivial' | 'low' | 'moderate' | 'high';

export function difficultyBand(totalXp: number, budget: Budget): DifficultyBand {
  if (totalXp < budget.low) return 'trivial';
  if (totalXp < budget.moderate) return 'low';
  if (totalXp < budget.high) return 'moderate';
  return 'high';
}

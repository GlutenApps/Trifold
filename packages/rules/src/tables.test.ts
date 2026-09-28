import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  crToNumber,
  difficultyBand,
  normalizeCr,
  partyBudget,
  proficiencyBonusForCr,
  xpForCr,
} from './tables';

describe('CR tables', () => {
  it('normalizes the string forms found in XML', () => {
    expect(normalizeCr(' 1/8 ')).toBe('1/8');
    expect(normalizeCr('0.5')).toBe('1/2');
    expect(normalizeCr(10)).toBe('10');
    expect(normalizeCr('31')).toBeNull();
    expect(normalizeCr('')).toBeNull();
    expect(normalizeCr(undefined)).toBeNull();
  });

  it('converts to numbers', () => {
    expect(crToNumber('1/4')).toBe(0.25);
    expect(crToNumber('17')).toBe(17);
  });

  it('maps CR to XP, with the no-attacks special case at CR 0', () => {
    expect(xpForCr('0')).toBe(10);
    expect(xpForCr('0', { hasAttacks: false })).toBe(0);
    expect(xpForCr('1/2')).toBe(100);
    expect(xpForCr('5')).toBe(1800);
    expect(xpForCr('30')).toBe(155000);
    expect(xpForCr('x')).toBeNull();
  });

  it('derives the proficiency bonus by CR band', () => {
    expect(proficiencyBonusForCr('1/8')).toBe(2);
    expect(proficiencyBonusForCr('4')).toBe(2);
    expect(proficiencyBonusForCr('5')).toBe(3);
    expect(proficiencyBonusForCr('12')).toBe(4);
    expect(proficiencyBonusForCr('13')).toBe(5);
    expect(proficiencyBonusForCr('20')).toBe(6);
    expect(proficiencyBonusForCr('24')).toBe(7);
    expect(proficiencyBonusForCr('28')).toBe(8);
    expect(proficiencyBonusForCr('30')).toBe(9);
  });

  it('computes ability modifiers', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(1)).toBe(-5);
  });
});

describe('2024 encounter budget', () => {
  it('sums per-character budgets with no multiplier', () => {
    expect(partyBudget([3, 3, 3, 3])).toEqual({ low: 600, moderate: 900, high: 1600 });
    expect(partyBudget([5, 4])).toEqual({ low: 750, moderate: 1125, high: 1600 });
  });

  it('clamps levels to 1–20', () => {
    expect(partyBudget([0])).toEqual(partyBudget([1]));
    expect(partyBudget([25])).toEqual(partyBudget([20]));
  });

  it('places totals into bands', () => {
    const budget = partyBudget([3, 3, 3, 3]);
    expect(difficultyBand(100, budget)).toBe('trivial');
    expect(difficultyBand(600, budget)).toBe('low');
    expect(difficultyBand(899, budget)).toBe('low');
    expect(difficultyBand(900, budget)).toBe('moderate');
    expect(difficultyBand(1600, budget)).toBe('high');
    expect(difficultyBand(9999, budget)).toBe('high');
  });
});

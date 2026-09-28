import { describe, expect, it } from 'vitest';
import {
  average,
  DiceError,
  doubleDice,
  formatTerms,
  isDiceExpression,
  parseDice,
  roll,
} from './dice';

/** Deterministic rng that yields the given die faces in order. */
function facesRng(faces: number[], sides: number): () => number {
  let i = 0;
  return () => {
    const face = faces[i % faces.length] ?? 1;
    i += 1;
    return (face - 1) / sides;
  };
}

describe('parseDice', () => {
  it('parses plain dice with a modifier', () => {
    expect(parseDice('2d6+3')).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 6 },
      { kind: 'const', sign: 1, value: 3 },
    ]);
  });

  it('defaults a missing count to 1 and accepts uppercase D', () => {
    expect(parseDice('d20')).toEqual([{ kind: 'dice', sign: 1, count: 1, sides: 20 }]);
    expect(parseDice('1D20-1')).toEqual([
      { kind: 'dice', sign: 1, count: 1, sides: 20 },
      { kind: 'const', sign: -1, value: 1 },
    ]);
  });

  it('parses keep-highest and keep-lowest', () => {
    expect(parseDice('4d6kh3')).toEqual([
      { kind: 'dice', sign: 1, count: 4, sides: 6, keep: { mode: 'h', n: 3 } },
    ]);
    expect(parseDice('2d20kl1')).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { mode: 'l', n: 1 } },
    ]);
  });

  it('parses the compound form seen in attack triples', () => {
    const terms = parseDice('(1d8+2)+(1d6)');
    expect(terms).toHaveLength(2);
    expect(terms[0]?.kind).toBe('group');
    expect(formatTerms(terms)).toBe('(1d8+2)+(1d6)');
  });

  it('parses an integer multiplier', () => {
    expect(parseDice('2d4x10')).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 4, factor: 10 },
    ]);
    expect(formatTerms(parseDice('(1d6+1) * 5'))).toBe('(1d6+1)x5');
    expect(parseDice('3x10')).toEqual([{ kind: 'const', sign: 1, value: 30 }]);
    expect(() => parseDice('2d4x')).toThrow(DiceError);
  });

  it('ignores whitespace', () => {
    expect(formatTerms(parseDice(' 2d6 + 3 - 1 '))).toBe('2d6+3-1');
  });

  it('rejects garbage', () => {
    for (const bad of ['', 'foo', '2d6+', '2d', '(1d6', '1d6)', '1d0', '0d6', '1001d6', '1d6kh0']) {
      expect(() => parseDice(bad), bad).toThrow(DiceError);
      expect(isDiceExpression(bad)).toBe(false);
    }
  });
});

describe('roll', () => {
  it('rolls each die, sums and applies modifiers', () => {
    const result = roll('2d6+3', facesRng([4, 2], 6));
    expect(result.total).toBe(9);
    expect(result.dice[0]?.rolls).toEqual([4, 2]);
  });

  it('keeps the highest n', () => {
    const result = roll('4d6kh3', facesRng([1, 6, 3, 5], 6));
    expect(result.dice[0]?.kept).toEqual([6, 5, 3]);
    expect(result.total).toBe(14);
  });

  it('applies multipliers to rolls and averages', () => {
    expect(roll('2d4x10', facesRng([3, 1], 4)).total).toBe(40);
    expect(average('1d4x10')).toBe(25);
  });

  it('handles negative groups', () => {
    const result = roll('10-(1d4+1)', facesRng([3], 4));
    expect(result.total).toBe(6);
  });

  it('never rolls outside 1..sides with a real rng', () => {
    for (let i = 0; i < 200; i += 1) {
      const r = roll('3d6');
      for (const face of r.dice[0]?.rolls ?? []) {
        expect(face).toBeGreaterThanOrEqual(1);
        expect(face).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('average and crits', () => {
  it('computes the expected value', () => {
    expect(average('2d6+3')).toBe(10);
    expect(average('1d8')).toBe(4.5);
    expect(average('(1d8+2)+(1d6)')).toBe(10);
  });

  it('doubles dice but not modifiers on a crit', () => {
    expect(formatTerms(doubleDice(parseDice('2d6+3')))).toBe('4d6+3');
    expect(formatTerms(doubleDice(parseDice('(1d8+2)+(1d6)')))).toBe('(2d8+2)+(2d6)');
  });
});

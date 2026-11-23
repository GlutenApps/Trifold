import { describe, expect, it } from 'vitest';
import type { CompendiumRecord } from '@trifold/schema';
import { copiesDiffer, recordNumbers, recordWords, sharedText, SHORT_TEXT } from './recordContent';

const monster = (cr: string, ac: number, hp: number, action: string) =>
  ({
    kind: 'monster',
    data: {
      cr,
      ac: { value: ac },
      hp: { average: hp },
      traits: [],
      actions: [{ name: 'Bite', text: action }],
      bonusActions: [],
      reactions: [],
      legendary: null,
    },
  }) as unknown as CompendiumRecord;

const long =
  'Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage and the target is Grappled';

describe('record content (ADR 0063)', () => {
  it('reads the deciding numbers and the rules words', () => {
    const wolf = monster('1', 13, 11, long);
    expect(recordNumbers(wolf)).toBe('1|13|11');
    expect(recordWords(wolf).slice(0, 4)).toEqual(['bite', 'melee', 'attack', 'roll']);
    // Little words carry no rules meaning.
    expect(recordWords(wolf)).not.toContain('the');
  });

  it('counts a shorter text held inside a longer one as the same', () => {
    const full = recordWords(monster('1', 13, 11, `${long}. It can also howl to call the pack.`));
    const summary = recordWords(monster('1', 13, 11, long));
    expect(sharedText(summary, full)).toBe(1);
    expect(sharedText(['a'], full)).toBe(1);
    expect(SHORT_TEXT).toBeGreaterThan(1);
  });

  it('tells a reprint from a copy that disagrees', () => {
    const at = (r: CompendiumRecord) => ({ numbers: recordNumbers(r), words: recordWords(r) });
    const a = at(monster('1', 13, 11, long));
    expect(copiesDiffer(a, at(monster('1', 13, 11, long.replace('Grappled', 'Grappled.'))))).toBe(
      false,
    );
    expect(copiesDiffer(a, at(monster('2', 13, 11, long)))).toBe(true);
    expect(
      copiesDiffer(
        a,
        at(
          monster(
            '1',
            13,
            11,
            'Ranged Spell Attack: +7, range 120 ft. Hit: 22 (4d10) Fire damage and it ignites anything flammable nearby',
          ),
        ),
      ),
    ).toBe(true);
  });
});

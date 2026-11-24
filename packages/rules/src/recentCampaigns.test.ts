import { describe, expect, it } from 'vitest';
import {
  compareRecent,
  matchesCampaignFilter,
  openedAgo,
  recentSlice,
  type RecentItem,
} from './recentCampaigns';

describe('compareRecent', () => {
  it('puts the most recently opened first, never-opened ones by their fallback, then by name', () => {
    const items: RecentItem[] = [
      {
        name: 'Alpha',
        openedAt: '2026-11-01T10:00:00.000Z',
        fallbackAt: '2026-11-20T00:00:00.000Z',
      },
      { name: 'Bravo', openedAt: null, fallbackAt: '2026-11-10T00:00:00.000Z' },
      {
        name: 'Charlie',
        openedAt: '2026-11-20T10:00:00.000Z',
        fallbackAt: '2026-01-01T00:00:00.000Z',
      },
      { name: 'Delta', fallbackAt: '2026-11-10T00:00:00.000Z' },
    ];
    expect([...items].sort(compareRecent).map((i) => i.name)).toEqual([
      'Charlie',
      'Bravo',
      'Delta',
      'Alpha',
    ]);
  });
});

describe('recentSlice', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  it('keeps a short list whole', () => {
    expect(recentSlice(['a', 'b'], () => false, 5)).toEqual({ shown: ['a', 'b'], more: false });
    expect(recentSlice(list.slice(0, 5), () => false, 5).more).toBe(false);
  });

  it('takes the first few and says more were left out', () => {
    expect(recentSlice(list, () => false, 5)).toEqual({
      shown: ['a', 'b', 'c', 'd', 'e'],
      more: true,
    });
  });

  it('keeps the open campaign, in the last place, when it falls outside', () => {
    expect(recentSlice(list, (x) => x === 'g', 5).shown).toEqual(['a', 'b', 'c', 'd', 'g']);
    expect(recentSlice(list, (x) => x === 'b', 5).shown).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('openedAgo', () => {
  const now = new Date(2026, 10, 24, 15, 0);
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

  it('counts calendar days on the local clock', () => {
    expect(openedAgo(at(2026, 10, 24, 1), now)).toBe('today');
    expect(openedAgo(at(2026, 10, 23, 23), now)).toBe('yesterday');
    expect(openedAgo(at(2026, 10, 21), now)).toBe('3 days ago');
    expect(openedAgo(at(2026, 10, 11), now)).toBe('13 days ago');
  });

  it('switches to weeks, months, then over a year', () => {
    expect(openedAgo(at(2026, 10, 10), now)).toBe('2 weeks ago');
    expect(openedAgo(at(2026, 8, 30), now)).toBe('7 weeks ago');
    expect(openedAgo(at(2026, 6, 24), now)).toBe('4 months ago');
    expect(openedAgo(at(2025, 10, 1), now)).toBe('over a year ago');
  });

  it('copes with a date from the future or one that does not parse', () => {
    expect(openedAgo(at(2026, 10, 25), now)).toBe('today');
    expect(openedAgo('not a date', now)).toBe('some time ago');
  });
});

describe('matchesCampaignFilter', () => {
  it('matches every typed word in any order, ignoring case', () => {
    expect(matchesCampaignFilter('The Lantern at Greyford', 'grey lan')).toBe(true);
    expect(matchesCampaignFilter('The Lantern at Greyford', 'GREYFORD')).toBe(true);
    expect(matchesCampaignFilter('The Lantern at Greyford', 'silt')).toBe(false);
    expect(matchesCampaignFilter('Anything', '  ')).toBe(true);
  });
});

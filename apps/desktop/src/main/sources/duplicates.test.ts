import { describe, expect, it } from 'vitest';
import { copyKey, copyKeyOf, duplicateGroupKey } from '@trifold/rules';
import { listDuplicates } from './duplicates';

const row = (
  key: string,
  name: string,
  source: string,
  extra: Partial<Parameters<typeof listDuplicates>[0][number]> = {},
) => ({
  id: `${source}:${key}`,
  kind: 'spell',
  key,
  display_name: name,
  source_id: source,
  source_name: `File ${source}`,
  source_kind: 'xml',
  book_key: '',
  book: '',
  edition: '2024',
  starred: 0,
  chosen: 0,
  content_numbers: '',
  content_words: '',
  rn: 2,
  ...extra,
});

const rows = [
  row('ward', 'Ward', 'A', { rn: 1, book_key: 'tome', book: 'Tome', starred: 1 }),
  row('ward', 'Ward', 'srd-2024', { source_name: 'SRD 5.2', source_kind: 'srd' }),
  row('veil', 'Veil', 'homebrew', { rn: 1, source_name: 'Homebrew', source_kind: 'homebrew' }),
  row('veil', 'Veil', 'A', { edition: '2014' }),
  row('bolt', 'Bolt', 'B', { rn: 1, chosen: 1, kind: 'monster' }),
  row('bolt', 'Bolt', 'A', { kind: 'monster' }),
  row('fog', 'Fog', 'A', { rn: 1 }),
  row('fog', 'Fog', 'B'),
];

describe('copies and groups (ADR 0063)', () => {
  it('names a copy by file, book and edition, from a record too', () => {
    expect(duplicateGroupKey('spell', 'ward')).toBe('spell|ward');
    expect(copyKey('A', 'tome', '2024')).toBe('A|tome|2024');
    expect(copyKeyOf({ sourceId: 'A', sourceBook: 'Tome', edition: '2024' })).toBe('A|tome|2024');
    expect(copyKeyOf({ sourceId: 'srd-2024', edition: '2024' })).toBe('srd-2024||2024');
  });
});

describe('listDuplicates', () => {
  it('groups copies, the one shown first, and says why it is shown', () => {
    const { total, groups } = listDuplicates(
      rows,
      { 'monster|bolt': 'B||2024' },
      { copies: 'all' },
    );
    expect(total).toBe(4);
    expect(groups.map((g) => [g.name, g.reason, g.chosen])).toEqual([
      ['Ward', 'starred', null],
      ['Veil', 'homebrew', null],
      ['Bolt', 'chosen', 'B||2024'],
      ['Fog', 'order', null],
    ]);
    expect(groups[0]!.copies.map((c) => [c.copy, c.sourceName, c.book, c.starred])).toEqual([
      ['A|tome|2024', 'File A', 'Tome', true],
      ['srd-2024||2024', 'SRD 5.2', '', false],
    ]);
  });

  it('forgets a choice whose copy is gone, and filters and pages', () => {
    const gone = listDuplicates(rows, { 'spell|fog': 'C||2024' }, { copies: 'all' });
    expect(gone.groups.find((g) => g.name === 'Fog')!.chosen).toBeNull();
    const choices = { 'monster|bolt': 'B||2024' };
    expect(
      listDuplicates(rows, choices, { show: 'settled', copies: 'all' }).groups.map((g) => g.name),
    ).toEqual(['Bolt']);
    expect(listDuplicates(rows, choices, { show: 'unsettled', copies: 'all' }).total).toBe(3);
    expect(listDuplicates(rows, choices, { kind: 'monster', copies: 'all' }).total).toBe(1);
    expect(
      listDuplicates(rows, choices, { text: 'VE', copies: 'all' }).groups.map((g) => g.name),
    ).toEqual(['Veil']);
    const page = listDuplicates(rows, choices, { offset: 1, limit: 2, copies: 'all' });
    expect([page.total, page.groups.map((g) => g.name)]).toEqual([4, ['Veil', 'Bolt']]);
  });

  it('lists only records whose copies of one edition disagree, unless asked for every one', () => {
    const text = 'w0 w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19';
    const kraken = [
      row('kraken', 'Kraken', 'A', {
        rn: 1,
        kind: 'monster',
        content_numbers: '23|18|472',
        content_words: text,
      }),
      row('kraken', 'Kraken', 'B', {
        kind: 'monster',
        content_numbers: '13|16|230',
        content_words: text,
      }),
    ];
    // The same stat block in two books, worded the same: a reprint.
    const guard = [
      row('guard', 'Guard', 'A', {
        rn: 1,
        kind: 'monster',
        content_numbers: '1|16|11',
        content_words: text,
      }),
      row('guard', 'Guard', 'srd-2014', {
        kind: 'monster',
        source_kind: 'srd',
        content_numbers: '1|16|11',
        content_words: text,
      }),
    ];
    // The same numbers, different attacks.
    const scout = [
      row('scout', 'Scout', 'A', {
        rn: 1,
        kind: 'monster',
        content_numbers: '1|13|16',
        content_words: text,
      }),
      row('scout', 'Scout', 'B', {
        kind: 'monster',
        content_numbers: '1|13|16',
        content_words: 'x0 x1 x2 x3 x4 x5 x6 x7 x8 x9 x10 x11 x12 x13 x14 x15 x16 x17 x18 x19',
      }),
    ];
    // A 2014 and a 2024 copy are meant to differ.
    const shield = [
      row('shield', 'Shield', 'A', {
        rn: 1,
        edition: '2014',
        content_numbers: '1|ab',
        content_words: text,
      }),
      row('shield', 'Shield', 'srd-2024', {
        source_kind: 'srd',
        content_numbers: '1|ab',
        content_words: 'x0 x1 x2 x3 x4 x5 x6 x7 x8 x9 x10 x11 x12 x13 x14 x15 x16 x17 x18 x19',
      }),
    ];
    const all = [...kraken, ...guard, ...scout, ...shield];
    const differ = listDuplicates(all, {});
    expect(differ.groups.map((g) => g.name)).toEqual(['Kraken', 'Scout']);
    expect(differ.groups[0]!.numbers).toEqual(['CR 23 · AC 18 · 472 HP', 'CR 13 · AC 16 · 230 HP']);
    expect(differ.groups[1]!.numbers).toBeUndefined();
    const every = listDuplicates(all, {}, { copies: 'all' });
    expect(every.groups.map((g) => [g.name, g.differ])).toEqual([
      ['Kraken', true],
      ['Guard', false],
      ['Scout', true],
      ['Shield', false],
    ]);
  });
});

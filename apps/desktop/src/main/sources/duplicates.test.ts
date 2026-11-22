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
    const { total, groups } = listDuplicates(rows, { 'monster|bolt': 'B||2024' });
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
    const gone = listDuplicates(rows, { 'spell|fog': 'C||2024' });
    expect(gone.groups.find((g) => g.name === 'Fog')!.chosen).toBeNull();
    const choices = { 'monster|bolt': 'B||2024' };
    expect(listDuplicates(rows, choices, { show: 'settled' }).groups.map((g) => g.name)).toEqual([
      'Bolt',
    ]);
    expect(listDuplicates(rows, choices, { show: 'unsettled' }).total).toBe(3);
    expect(listDuplicates(rows, choices, { kind: 'monster' }).total).toBe(1);
    expect(listDuplicates(rows, choices, { text: 'VE' }).groups.map((g) => g.name)).toEqual([
      'Veil',
    ]);
    const page = listDuplicates(rows, choices, { offset: 1, limit: 2 });
    expect([page.total, page.groups.map((g) => g.name)]).toEqual([4, ['Veil', 'Bolt']]);
  });
});

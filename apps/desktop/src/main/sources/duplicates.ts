import type { DuplicateGroup, DuplicateQuery } from '@trifold/api';
import { copiesDiffer, copyKey, duplicateGroupKey } from '@trifold/rules';
import type { RecordKind } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';

/**
 * Duplicates (ADR 0063): records in more than one place, grouped, with the copy that answers
 * first and why, filtered and paged for the Duplicates tab.
 */

type Row = ReturnType<IndexDb['duplicateRows']>[number];

/** `CR 2 · AC 13 · 45 HP`, `level 3 · EN`: a copy's deciding numbers, as a row shows them. */
function numbersLabel(kind: string, numbers: string): string {
  const [a = '', b = '', c = ''] = numbers.split('|');
  if (kind === 'monster') return `CR ${a} · AC ${b} · ${c} HP`;
  if (kind === 'spell') return `level ${a}${b ? ` · ${b.toUpperCase()}` : ''}`;
  if (kind === 'item') return [a || 'no rarity', b && `AC ${b}`, c].filter(Boolean).join(' · ');
  return numbers;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function listDuplicates(
  rows: readonly Row[],
  choices: Readonly<Record<string, string>>,
  query: DuplicateQuery = {},
): { total: number; groups: DuplicateGroup[] } {
  const groups = new Map<string, DuplicateGroup>();
  const contents = new Map<string, Array<{ edition: string; numbers: string; words: string[] }>>();
  for (const row of rows) {
    const group = duplicateGroupKey(row.kind, row.key);
    let entry = groups.get(group);
    if (!entry) {
      entry = {
        group,
        kind: row.kind as RecordKind,
        name: row.display_name,
        copies: [],
        chosen: null,
        reason: 'order',
        differ: false,
      };
      groups.set(group, entry);
      contents.set(group, []);
    }
    contents.get(group)!.push({
      edition: row.edition,
      numbers: row.content_numbers,
      words: row.content_words ? row.content_words.split(' ') : [],
    });
    const copy = copyKey(row.source_id, row.book_key, row.edition);
    const homebrew = row.source_kind === 'homebrew';
    entry.copies.push({
      recordId: row.id,
      copy,
      sourceName: row.source_name,
      book: row.book,
      edition: row.edition,
      homebrew,
      ...(row.source_kind === 'srd' ? { srd: true } : {}),
      starred: row.starred === 1,
    });
    if (row.rn === 1) {
      entry.name = row.display_name;
      entry.reason =
        row.chosen === 1
          ? 'chosen'
          : homebrew
            ? 'homebrew'
            : row.starred === 1
              ? 'starred'
              : 'order';
    }
  }
  for (const entry of groups.values()) {
    // Copies are compared within an edition: a 2014 and a 2024 copy are meant to differ.
    const copies = contents.get(entry.group)!;
    const differing = new Set<string>();
    for (let i = 0; i < copies.length; i++) {
      for (let j = i + 1; j < copies.length; j++) {
        const a = copies[i]!;
        const b = copies[j]!;
        if (a.edition !== b.edition || !copiesDiffer(a, b)) continue;
        entry.differ = true;
        if (a.numbers !== b.numbers) {
          differing.add(numbersLabel(entry.kind, a.numbers));
          differing.add(numbersLabel(entry.kind, b.numbers));
        }
      }
    }
    if (differing.size) entry.numbers = [...differing];
    const choice = choices[entry.group];
    // A choice whose copy is gone leaves the record to the usual order.
    entry.chosen = choice && entry.copies.some((c) => c.copy === choice) ? choice : null;
  }

  const text = query.text?.trim().toLowerCase() ?? '';
  const kept = [...groups.values()].filter(
    (g) =>
      (!query.kind || g.kind === query.kind) &&
      (!text || g.name.toLowerCase().includes(text)) &&
      (query.show !== 'settled' || g.chosen !== null) &&
      (query.show !== 'unsettled' || g.chosen === null) &&
      (query.copies === 'all' || g.differ),
  );
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  return { total: kept.length, groups: kept.slice(offset, offset + limit) };
}

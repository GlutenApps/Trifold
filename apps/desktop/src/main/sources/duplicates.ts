import type { DuplicateGroup, DuplicateQuery } from '@trifold/api';
import { copyKey, duplicateGroupKey } from '@trifold/rules';
import type { RecordKind } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';

/**
 * Duplicates (ADR 0063): records in more than one place, grouped, with the copy that answers
 * first and why, filtered and paged for the Duplicates tab.
 */

type Row = ReturnType<IndexDb['duplicateRows']>[number];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function listDuplicates(
  rows: readonly Row[],
  choices: Readonly<Record<string, string>>,
  query: DuplicateQuery = {},
): { total: number; groups: DuplicateGroup[] } {
  const groups = new Map<string, DuplicateGroup>();
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
      };
      groups.set(group, entry);
    }
    const copy = copyKey(row.source_id, row.book_key, row.edition);
    const homebrew = row.source_kind === 'homebrew';
    entry.copies.push({
      recordId: row.id,
      copy,
      sourceName: row.source_name,
      book: row.book,
      edition: row.edition,
      homebrew,
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
      (query.show !== 'unsettled' || g.chosen === null),
  );
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  return { total: kept.length, groups: kept.slice(offset, offset + limit) };
}

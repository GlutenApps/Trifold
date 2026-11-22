import { useCallback, useEffect, useState } from 'react';
import type { DuplicateCopy, DuplicateGroup, DuplicateQuery } from '@trifold/api';
import { duplicateGroupKey } from '@trifold/rules';
import { errorMessage, type RecordKind } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCompendiumStore } from '../../stores/compendiumStore';

/**
 * Duplicates (ADR 0063): every record that is in more than one place, the copy shown for it and
 * why, and a choice of copy, one record at a time. A GM settles the clashes that matter as they
 * meet them, here or with Always use this copy on a record's page, instead of ordering every
 * source. Choices are kept in the Library and survive Re-parse.
 */

const PAGE = 100;

const KINDS: Array<[RecordKind, string]> = [
  ['monster', 'Monsters'],
  ['spell', 'Spells'],
  ['item', 'Items'],
  ['feat', 'Feats'],
  ['species', 'Species'],
  ['background', 'Backgrounds'],
  ['class', 'Classes'],
  ['condition', 'Conditions'],
  ['rule', 'Rules'],
];

const REASONS: Record<DuplicateGroup['reason'], string> = {
  chosen: 'your choice',
  homebrew: 'your homebrew comes first',
  starred: 'from a starred book',
  order: 'imported files come before the SRD',
};

/** "Book · legacy" or "File · 2024": where a copy is, as its option says. */
export function copyLabel(copy: DuplicateCopy): string {
  const where = copy.homebrew ? 'Homebrew' : copy.book || copy.sourceName;
  const extra = copy.book && copy.book !== copy.sourceName ? ` (${copy.sourceName})` : '';
  const edition = copy.edition === '2014' ? 'legacy' : copy.edition;
  return `${where}${extra} · ${edition}${copy.starred ? ' · starred' : ''}`;
}

/** Saves a choice of copy for one record, or with null leaves it to the usual order. */
export async function chooseCopy(kind: string, key: string, copy: string | null): Promise<void> {
  const app = useAppStore.getState();
  const choices = { ...(app.library?.settings?.duplicateChoices ?? {}) };
  const group = duplicateGroupKey(kind, key);
  if (copy) choices[group] = copy;
  else delete choices[group];
  await app.updateSettings({ duplicateChoices: choices });
  // The lists and the open record may now show another copy.
  void useCompendiumStore.getState().search();
}

export function DuplicatesView() {
  const [query, setQuery] = useState<DuplicateQuery>({ show: 'all' });
  const [limit, setLimit] = useState(PAGE);
  const [result, setResult] = useState<{ total: number; groups: DuplicateGroup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResult(await window.trifold.duplicates.list({ ...query, limit }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [query, limit]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 120);
    return () => window.clearTimeout(t);
  }, [load]);

  const choose = async (group: DuplicateGroup, copy: string | null) => {
    setBusy(group.group);
    try {
      const at = group.group.indexOf('|');
      await chooseCopy(group.group.slice(0, at), group.group.slice(at + 1), copy);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const set = (patch: Partial<DuplicateQuery>) => {
    setLimit(PAGE);
    setQuery((q) => ({ ...q, ...patch }));
  };

  return (
    <div className="duplicates-view" data-testid="duplicates-view">
      <p className="muted small">
        Records that are in more than one file or book. Each shows one copy: your choice, then your
        homebrew, then a starred book, then imported files before the SRD. Pick a copy to settle a
        record; Automatic leaves it to that order. The other copies stay on the record.
      </p>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="row books-filters">
        <input
          type="search"
          className="grow"
          aria-label="Search duplicates"
          placeholder="Search records"
          value={query.text ?? ''}
          onChange={(e) => set({ text: e.target.value })}
        />
        <select
          aria-label="Kind"
          value={query.kind ?? ''}
          onChange={(e) =>
            set(e.target.value ? { kind: e.target.value as RecordKind } : { kind: undefined })
          }
        >
          <option value="">Every kind</option>
          {KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Settled"
          value={query.show ?? 'all'}
          onChange={(e) => set({ show: e.target.value as DuplicateQuery['show'] })}
        >
          <option value="all">All records</option>
          <option value="unsettled">Left to the order</option>
          <option value="settled">Settled by you</option>
        </select>
      </div>
      {result === null ? (
        <p className="muted">Looking for duplicates…</p>
      ) : result.total === 0 ? (
        <p className="muted">
          {query.text || query.kind || query.show !== 'all'
            ? 'No duplicate matches.'
            : 'No record is in more than one place.'}
        </p>
      ) : (
        <>
          <p className="muted small" role="status">
            {result.total.toLocaleString()} {result.total === 1 ? 'record' : 'records'}
          </p>
          <ul className="duplicates-list" aria-label="Duplicates">
            {result.groups.map((g) => (
              <li key={g.group} className="duplicate-row" data-testid="duplicate-row">
                <div className="row">
                  <strong>{g.name}</strong>
                  <span className="badge">{g.kind}</span>
                  <span className="muted small">
                    Shown: {copyLabel(g.copies[0]!)}, {REASONS[g.reason]}
                  </span>
                </div>
                <fieldset className="duplicate-copies" disabled={busy === g.group}>
                  <legend className="sr-only">Copy of {g.name} to show</legend>
                  <label>
                    <input
                      type="radio"
                      name={`dup-${g.group}`}
                      checked={g.chosen === null}
                      onChange={() => void choose(g, null)}
                    />
                    Automatic
                  </label>
                  {g.copies.map((c) => (
                    <label key={c.recordId}>
                      <input
                        type="radio"
                        name={`dup-${g.group}`}
                        checked={g.chosen === c.copy}
                        onChange={() => void choose(g, c.copy)}
                      />
                      {copyLabel(c)}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
          {result.groups.length < result.total && (
            <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
              Show more ({(result.total - result.groups.length).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

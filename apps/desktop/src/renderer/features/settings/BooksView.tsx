import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookSummary, CampaignSummary, SharingOverview, SourceSummary } from '@trifold/api';
import { errorMessage } from '@trifold/schema';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';
import { CollectionsSection, useCollections } from './CollectionsSection';

/**
 * The Books tab of Library › Compendium › Sources (ADR 0061): every book across the imported
 * files, one row each, whichever file it came from. A book can be starred, so its copy of a
 * record answers first (after homebrew), turned off, so it leaves the compendium, and marked as
 * 2024 rules. Search, filters and a selection make a long list workable: what a GM does to one
 * book they can do to forty.
 */

type Show = 'all' | 'starred' | 'on' | 'off';

/** "2024", "Legacy", or "Mixed" when a book has both. */
export function rulesOf(book: Pick<BookSummary, 'editions'>): '2024' | 'Legacy' | 'Mixed' | '—' {
  const { '2024': modern, '2014': legacy } = book.editions;
  if (modern && legacy) return 'Mixed';
  if (modern) return '2024';
  if (legacy) return 'Legacy';
  return '—';
}

/** A book's name without its bracketed tags, which its row shows as badges. A year stays. */
export function bookTitle(book: Pick<BookSummary, 'name' | 'tags'>): string {
  let title = book.name;
  for (const tag of book.tags) title = title.replace(`(${tag})`, '');
  return title.replace(/\s{2,}/g, ' ').trim() || book.name;
}

/** "12 monsters, 3 spells": what a book holds, for its row's tooltip. */
function contents(book: BookSummary): string {
  return Object.entries(book.counts)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(
      ([kind, n]) =>
        `${n} ${kind}${n === 1 || kind === 'species' ? '' : kind === 'class' ? 'es' : 's'}`,
    )
    .join(', ');
}

/** Whether a book is kept by the filters. */
export function bookMatches(
  book: BookSummary,
  filter: {
    text: string;
    show: Show;
    tag: string;
    fileId: string;
    /** The books of the collection picked, or null for every book. */
    inCollection?: ReadonlySet<string> | null;
  },
): boolean {
  if (filter.inCollection && !filter.inCollection.has(book.key)) return false;
  const text = filter.text.trim().toLowerCase();
  if (text && !book.name.toLowerCase().includes(text)) return false;
  if (filter.show === 'starred' && !book.starred) return false;
  if (filter.show === 'on' && book.off) return false;
  if (filter.show === 'off' && !book.off) return false;
  if (filter.tag && !book.tags.includes(filter.tag)) return false;
  if (filter.fileId && !book.files.some((f) => f.id === filter.fileId)) return false;
  return true;
}

export function BooksView({
  files,
  onBrowse,
  campaigns = [],
  sharing = null,
  onShared = () => undefined,
}: {
  /** The imported files, for the file filter and the attention bar. */
  files: readonly SourceSummary[];
  /** Opens the compendium filtered to one book. */
  onBrowse(book: BookSummary): void;
  /** Every campaign, for the campaigns a collection is used by and shared in. */
  campaigns?: readonly CampaignSummary[];
  sharing?: SharingOverview | null;
  onShared?(overview: SharingOverview): void;
}) {
  const { collections, save: saveCollections } = useCollections();
  const [collectionId, setCollectionId] = useState('');
  const picked = collections.find((c) => c.id === collectionId) ?? null;
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [tag, setTag] = useState('');
  const [fileId, setFileId] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const importing = useSourcesStore((s) => s.importing);

  const load = useCallback(async () => {
    try {
      setBooks(await window.trifold.books.list());
    } catch (err) {
      setError(errorMessage(err));
      setBooks([]);
    }
  }, []);
  // Read again whenever the files change: an import, a re-parse, a removal.
  useEffect(() => {
    void load();
  }, [load, files]);

  const run = async (task: () => Promise<BookSummary[]>) => {
    setBusy(true);
    setError(null);
    try {
      setBooks(await task());
      // The compendium's lists may now answer from another copy, or lose a book.
      void useCompendiumStore.getState().search();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const update = (keys: string[], patch: { starred?: boolean; off?: boolean }) =>
    run(() => window.trifold.books.update(keys, patch));
  const setRules = (keys: string[], use2024: boolean) =>
    run(async () => {
      const next = await window.trifold.books.setRules(keys, use2024);
      // A re-read file's records changed: the Files tab's counts follow.
      void useSourcesStore.getState().load();
      return next;
    });

  const all = useMemo(() => books ?? [], [books]);
  const tags = useMemo(() => [...new Set(all.flatMap((b) => b.tags))].sort(), [all]);
  const inCollection = useMemo(() => (picked ? new Set(picked.bookKeys) : null), [picked]);
  const shown = all.filter((b) => bookMatches(b, { text, show, tag, fileId, inCollection }));
  /** Adds the chosen books to a collection, or takes them out of the one picked. */
  const file = (id: string, keys: string[], into: boolean) =>
    void saveCollections(
      collections.map((c) =>
        c.id !== id
          ? c
          : {
              ...c,
              bookKeys: into
                ? [...new Set([...c.bookKeys, ...keys])]
                : c.bookKeys.filter((k) => !keys.includes(k)),
            },
      ),
    );
  const chosen = [...selected].filter((k) => all.some((b) => b.key === k));
  const allShownChosen = shown.length > 0 && shown.every((b) => selected.has(b.key));
  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  // What needs a look: files that can be re-parsed or carry warnings, books in two files.
  const reparse = files.filter((f) => f.stale).length;
  const warned = files.filter((f) => f.warnings.length > 0).length;
  const inTwo = all.filter((b) => b.files.length > 1).length;
  // Records whose copies disagree that the GM has not settled (ADR 0063); reprints are left out.
  const [unsettled, setUnsettled] = useState(0);
  useEffect(() => {
    let stale = false;
    void window.trifold.duplicates
      .list({ show: 'unsettled', limit: 1 })
      .then((r) => {
        if (!stale) setUnsettled(r.total);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [books]);
  const attention = [
    reparse && `${reparse} ${reparse === 1 ? 'file' : 'files'} can be re-parsed (Files tab)`,
    warned && `${warned} ${warned === 1 ? 'file has' : 'files have'} import warnings (Files tab)`,
    inTwo && `${inTwo} ${inTwo === 1 ? 'book is' : 'books are'} in more than one file`,
    unsettled &&
      `${unsettled.toLocaleString()} ${unsettled === 1 ? 'record has copies' : 'records have copies'} that disagree (Duplicates tab)`,
  ].filter(Boolean);

  return (
    <div className="books-view" data-testid="books-view">
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <p className="muted small">
        Every book in your imported files. When a record is in more than one book, a starred book’s
        copy is shown first, after your homebrew. A book that is off leaves the compendium; its file
        keeps it.
      </p>
      {attention.length > 0 && (
        <p className="books-attention small" role="status" data-testid="books-attention">
          <Icon name="warning" size={14} /> {attention.join(' · ')}
        </p>
      )}

      <CollectionsSection
        books={all}
        campaigns={campaigns}
        sharing={sharing}
        onShared={onShared}
        active={collectionId}
        onPick={setCollectionId}
      />

      <div className="row books-filters">
        <input
          type="search"
          className="grow"
          aria-label="Search books"
          placeholder="Search books"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {collections.length > 0 && (
          <select
            aria-label="Collection"
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            <option value="">Every collection</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as Show)}>
          <option value="all">All books</option>
          <option value="starred">Starred</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
        {tags.length > 0 && (
          <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {files.length > 1 && (
          <select aria-label="File" value={fileId} onChange={(e) => setFileId(e.target.value)}>
            <option value="">Any file</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="row books-bulk" role="toolbar" aria-label="Selected books">
        <label className="field inline">
          <input
            type="checkbox"
            aria-label="Select every book shown"
            checked={allShownChosen}
            disabled={shown.length === 0}
            onChange={(e) =>
              setSelected((prev) => {
                const next = new Set(prev);
                for (const b of shown) {
                  if (e.target.checked) next.add(b.key);
                  else next.delete(b.key);
                }
                return next;
              })
            }
          />
          {chosen.length ? `${chosen.length} selected` : `${shown.length} of ${all.length} books`}
        </label>
        <span className="spacer" />
        {chosen.length > 0 && (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void update(chosen, { starred: true })}
            >
              Star
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void update(chosen, { starred: false })}
            >
              Unstar
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void update(chosen, { off: false })}
            >
              Turn on
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void update(chosen, { off: true })}
            >
              Turn off
            </button>
            <select
              aria-label="Rules for the selected books"
              value=""
              disabled={busy || importing}
              onChange={(e) => {
                if (e.target.value) void setRules(chosen, e.target.value === '2024');
              }}
            >
              <option value="">Rules…</option>
              <option value="2024">2024 rules</option>
              <option value="legacy">Legacy rules</option>
            </select>
            {collections.length > 0 && (
              <select
                aria-label="Add the selected books to a collection"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  file(e.target.value, chosen, true);
                  // Filed: the next action starts from a fresh selection.
                  setSelected(new Set());
                }}
              >
                <option value="">Add to…</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {picked && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  file(picked.id, chosen, false);
                  setSelected(new Set());
                }}
              >
                Remove from {picked.name}
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </>
        )}
      </div>

      {books === null ? (
        <p className="muted">Reading your books…</p>
      ) : all.length === 0 ? (
        <p className="muted">No imported books yet. Import a compendium file to add some.</p>
      ) : shown.length === 0 ? (
        <p className="muted">No book matches.</p>
      ) : (
        <ul className="books-table" aria-label="Books">
          {shown.map((b) => (
            <li
              key={b.key}
              className={`book-row${b.off ? ' off' : ''}${selected.has(b.key) ? ' selected' : ''}`}
              data-testid="book-row"
            >
              <input
                type="checkbox"
                aria-label={`Select ${b.name}`}
                checked={selected.has(b.key)}
                onChange={(e) => toggle(b.key, e.target.checked)}
              />
              <button
                type="button"
                className={`chrome-btn xs book-star${b.starred ? ' on' : ''}`}
                aria-label={`Star ${b.name}`}
                aria-pressed={b.starred}
                title={
                  b.starred
                    ? 'Starred: its copies answer first. Click to unstar'
                    : 'Star: its copies answer first'
                }
                disabled={busy}
                onClick={() => void update([b.key], { starred: !b.starred })}
              >
                <Icon name="star" />
              </button>
              <span className="book-name" title={contents(b)}>
                {b.unnamed ? (
                  <>
                    {b.name} <span className="muted">· records that name no book</span>
                  </>
                ) : (
                  bookTitle(b)
                )}
                {b.tags.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
              </span>
              <span className="muted small book-count">{b.records.toLocaleString()}</span>
              <span className="muted small book-rules">{rulesOf(b)}</span>
              <span
                className="muted small book-files"
                title={b.files.map((f) => `${f.name}: ${f.records}`).join('\n')}
              >
                {b.files.length === 1 ? b.files[0]!.name : `${b.files.length} files`}
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Browse ${b.name}`}
                  title="Browse its records in the compendium"
                  onClick={() => onBrowse(b)}
                >
                  <Icon name="compendium" />
                </button>
              </span>
              <label className="book-on" title={b.off ? 'Off: left out of the compendium' : 'On'}>
                <input
                  type="checkbox"
                  aria-label={`${b.name} on`}
                  checked={!b.off}
                  disabled={busy}
                  onChange={(e) => void update([b.key], { off: !e.target.checked })}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { SourceSummary } from '@trifold/api';
import { errorMessage, type LibrarySettings } from '@trifold/schema';

/**
 * Export for players (ADR 0064), at the foot of a campaign's Shared sources tab: a
 * `.trifold-players` pack of what the campaign shares, for players to open before the first
 * session, when nobody is on the same network yet. Shared homebrew and creatures always go in.
 * A shared imported source or collection goes in only when ticked here: a pack is a file that
 * can be forwarded and never expires, unlike sharing at the table. Trifold sends it nowhere.
 */
export function ExportForPlayers({
  sources,
  books = [],
  collections,
  nothingShared = false,
}: {
  /** The campaign shares no homebrew, companions, books, sources or collections yet. */
  nothingShared?: boolean;
  /** The whole files the campaign shares, as campaigns did before books (ADR 0067). */
  sources: readonly SourceSummary[];
  /** The books the campaign shares (ADR 0067). */
  books?: ReadonlyArray<{ key: string; name: string; userContent: boolean }>;
  /** The collections the campaign shares. */
  collections: LibrarySettings['collections'];
}) {
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [bookKeys, setBookKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userContent =
    sources.some((s) => sourceIds.includes(s.id) && s.license.nonSrd) ||
    books.some((b) => bookKeys.includes(b.key) && b.userContent);
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...list, id] : list.filter((x) => x !== id);

  const run = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await window.trifold.campaigns.exportForPlayers({
        sourceIds,
        collectionIds,
        bookKeys,
      });
      if (result) {
        setDone(
          `Saved ${result.records.toLocaleString()} ${result.records === 1 ? 'record' : 'records'} to ${result.path}. Send it to your players however you like.`,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="export-players"
      aria-label="Export for players"
      data-testid="export-players"
    >
      <h2>Export for players</h2>
      <p className="muted small">
        A file your players open in their Trifold before the first session, with the homebrew and
        companions you share. Tick a shared book or collection to put it in too; the files left out
        are listed by name, so a player who owns one can import it.
      </p>
      {(sources.length > 0 || books.length > 0 || collections.length > 0) && (
        <ul className="shared-list" aria-label="Also put in the pack">
          {books.map((b) => (
            <li key={b.key} className="shared-row">
              <label className="field inline grow">
                <input
                  type="checkbox"
                  aria-label={`Put ${b.name} in the pack`}
                  checked={bookKeys.includes(b.key)}
                  onChange={(e) => setBookKeys((l) => toggle(l, b.key, e.target.checked))}
                />
                {b.name}
              </label>
              {b.userContent && <span className="badge">user content</span>}
            </li>
          ))}
          {sources.map((s) => (
            <li key={s.id} className="shared-row">
              <label className="field inline grow">
                <input
                  type="checkbox"
                  aria-label={`Put ${s.name} in the pack`}
                  checked={sourceIds.includes(s.id)}
                  onChange={(e) => setSourceIds((l) => toggle(l, s.id, e.target.checked))}
                />
                {s.name}
              </label>
              {s.license.nonSrd && <span className="badge">user content</span>}
            </li>
          ))}
          {collections.map((c) => (
            <li key={c.id} className="shared-row">
              <label className="field inline grow">
                <input
                  type="checkbox"
                  aria-label={`Put ${c.name} in the pack`}
                  checked={collectionIds.includes(c.id)}
                  onChange={(e) => setCollectionIds((l) => toggle(l, c.id, e.target.checked))}
                />
                {c.name}
              </label>
              <span className="muted small">collection</span>
            </li>
          ))}
        </ul>
      )}
      {nothingShared && (
        <p className="muted small" role="status" data-testid="export-players-empty">
          Nothing is shared yet, so the file would only add the campaign to your players’ Playing
          list, ready for the first session.
        </p>
      )}
      {(userContent || collectionIds.length > 0) && (
        <p className="warn-text small" role="note">
          A pack can be passed on and never expires. Put in content from outside the SRD only for
          players who are entitled to it.
        </p>
      )}
      {error && (
        <p className="small join-problem" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="muted small" role="status" data-testid="export-players-done">
          {done}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
          {busy ? 'Saving…' : 'Export for players…'}
        </button>
      </div>
    </section>
  );
}

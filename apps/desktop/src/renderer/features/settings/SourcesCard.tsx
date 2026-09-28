import { useEffect, useState } from 'react';
import type { SourceSummary } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useSourcesStore } from '../../stores/sourcesStore';

function counts(source: SourceSummary): string {
  const entries = Object.entries(source.recordCounts).filter(([, n]) => (n ?? 0) > 0);
  if (entries.length === 0) return 'no records';
  return entries.map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ');
}

function SourceRow({ source }: { source: SourceSummary }) {
  const setEnabled = useSourcesStore((s) => s.setEnabled);
  const remove = useSourcesStore((s) => s.remove);
  const reimport = useSourcesStore((s) => s.reimport);
  const importing = useSourcesStore((s) => s.importing);
  const [showWarnings, setShowWarnings] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="source-row" data-testid="source-row">
      <div className="row">
        <label>
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={(e) => void setEnabled(source.id, e.target.checked)}
          />
          <strong>{source.name}</strong>
        </label>
        {source.bundled ? (
          <span className="badge">bundled SRD</span>
        ) : (
          <span className="badge">{source.kind}</span>
        )}
        {source.license.nonSrd && <span className="badge">user content</span>}
        {source.stale && <span className="badge warn">parser updated</span>}
        <span className="muted">{counts(source)}</span>
        <span className="spacer" />
        {source.stale && (
          <button
            type="button"
            className="btn"
            disabled={importing}
            onClick={() => void reimport(source.id)}
          >
            Re-parse
          </button>
        )}
        {source.warnings.length > 0 && (
          <button type="button" className="btn" onClick={() => setShowWarnings((v) => !v)}>
            {source.warnings.length} warning{source.warnings.length === 1 ? '' : 's'}
          </button>
        )}
        {!source.bundled && !confirmRemove && (
          <button type="button" className="btn" onClick={() => setConfirmRemove(true)}>
            Remove…
          </button>
        )}
        {!source.bundled && confirmRemove && (
          <>
            <button type="button" className="btn" onClick={() => void remove(source.id)}>
              Remove for good
            </button>
            <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
              Keep
            </button>
          </>
        )}
      </div>
      <p className="muted small">
        {source.bundled ? 'Snapshot taken' : 'Imported'}{' '}
        {new Date(source.importedAt).toLocaleString()} · default edition {source.defaultEdition}
      </p>
      {showWarnings && <pre className="source-text warnings">{source.warnings.join('\n')}</pre>}
    </div>
  );
}

export function SourcesCard() {
  const sources = useSourcesStore((s) => s.sources);
  const importing = useSourcesStore((s) => s.importing);
  const progress = useSourcesStore((s) => s.progress);
  const lastReport = useSourcesStore((s) => s.lastReport);
  const error = useSourcesStore((s) => s.error);
  const load = useSourcesStore((s) => s.load);
  const importFromDialog = useSourcesStore((s) => s.importFromDialog);
  const rebuildIndex = useSourcesStore((s) => s.rebuildIndex);
  const setProgress = useSourcesStore((s) => s.setProgress);
  const clearError = useSourcesStore((s) => s.clearError);
  const library = useAppStore((s) => s.library);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const books = library?.settings?.edition2024Books ?? [];
  const booksKey = books.join('\n');
  const [booksText, setBooksText] = useState(booksKey);

  useEffect(() => {
    void load();
    return window.trifold.on('importProgress', setProgress);
  }, [load, setProgress]);

  useEffect(() => {
    setBooksText(booksKey);
  }, [booksKey]);

  const percent =
    progress &&
    progress.totalBytes > 0 &&
    (progress.phase === 'hashing' || progress.phase === 'parsing')
      ? Math.round((progress.bytesRead / progress.totalBytes) * 100)
      : null;

  const reportLine = (() => {
    if (!lastReport) return null;
    if (lastReport.status === 'unchanged')
      return `${lastReport.name} is already imported and unchanged.`;
    const verb = lastReport.status === 'updated' ? 'Updated' : 'Imported';
    const counted = Object.entries(lastReport.counts)
      .map(([k, n]) => `${n} ${k}`)
      .join(', ');
    const diff = lastReport.diff
      ? ` (${lastReport.diff.added} added, ${lastReport.diff.changed} changed, ${lastReport.diff.removed} removed)`
      : '';
    const warned =
      lastReport.warnings.length > 0 ? ` · ${lastReport.warnings.length} warnings` : '';
    return `${verb} ${lastReport.name}: ${counted} in ${(lastReport.durationMs / 1000).toFixed(1)} s${diff}${warned}`;
  })();

  return (
    <div className="card">
      <h2>Sources</h2>
      <p className="muted">
        Bundled SRD content ships with the app. Compendium XML files you import stay in this Library
        and are never sent anywhere.
      </p>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={importing || !library?.ok}
          onClick={() => void importFromDialog()}
        >
          Import XML file…
        </button>
        <button
          type="button"
          className="btn"
          disabled={importing || !library?.index.ok}
          onClick={() => void rebuildIndex()}
        >
          Rebuild index
        </button>
        {importing && (
          <span className="muted" data-testid="import-progress">
            {progress
              ? `${progress.phase}${percent !== null ? ` ${percent}%` : ''}${progress.records ? ` · ${progress.records} records` : ''}`
              : 'starting…'}
          </span>
        )}
      </div>
      {reportLine && (
        <p className="muted" data-testid="import-report">
          {reportLine}
        </p>
      )}
      {sources.length === 0 ? (
        <p className="muted">No sources yet.</p>
      ) : (
        sources.map((s) => <SourceRow key={s.id} source={s} />)
      )}

      <h2 className="mt">2024 rules by source book</h2>
      <p className="muted">
        Records whose Source line names one of these books are tagged as 2024 rules even without a
        [5.5e] suffix. One book name per line, matched loosely. Applies to future imports.
      </p>
      <textarea
        aria-label="2024 source books"
        rows={3}
        value={booksText}
        onChange={(e) => setBooksText(e.target.value)}
        onBlur={() =>
          void updateSettings({
            edition2024Books: booksText
              .split('\n')
              .map((b) => b.trim())
              .filter(Boolean),
          })
        }
      />
    </div>
  );
}

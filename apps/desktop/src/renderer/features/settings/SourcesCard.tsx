import { InlineConfirm } from '../shell/InlineConfirm';
import { useEffect, useState } from 'react';
import type { SourceSummary } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';

/**
 * The Sources card, shown under Library › Compendium › Sources (DESIGN.md §6.1): every bundled
 * and imported source with its enabled flag, record counts and import warnings, the XML import
 * and index rebuild, and the list of books whose records count as 2024 rules without a [5.5e]
 * suffix (DATA-FORMATS.md §2.10). Importing runs in main and reports progress over the
 * `importProgress` event; a source whose parser has moved on since it was imported is marked
 * stale and can be re-parsed.
 */
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
        <span className="muted">
          {counts(source)}
          {source.warnings.length > 0 &&
            ` · ${source.warnings.length} warning${source.warnings.length === 1 ? '' : 's'}`}
        </span>
        <span className="spacer" />
        {confirmRemove ? (
          <InlineConfirm
            name={source.name}
            verb="Remove"
            onConfirm={() => void remove(source.id)}
            onKeep={() => setConfirmRemove(false)}
          />
        ) : (
          <span className="row-actions">
            {source.stale && (
              <button
                type="button"
                className="chrome-btn xs"
                title="Re-parse with the updated parser"
                aria-label={`Re-parse ${source.name}`}
                disabled={importing}
                onClick={() => void reimport(source.id)}
              >
                <Icon name="refresh" />
              </button>
            )}
            {source.warnings.length > 0 && (
              <button
                type="button"
                className={`chrome-btn xs${showWarnings ? ' on' : ''}`}
                title={showWarnings ? 'Hide warnings' : 'Show warnings'}
                aria-label={`Warnings for ${source.name}`}
                aria-pressed={showWarnings}
                onClick={() => setShowWarnings((v) => !v)}
              >
                <Icon name="eye" />
              </button>
            )}
            {!source.bundled && (
              <button
                type="button"
                className="chrome-btn xs danger"
                title="Remove this source"
                aria-label={`Remove ${source.name}`}
                onClick={() => setConfirmRemove(true)}
              >
                <Icon name="trash" />
              </button>
            )}
          </span>
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
          <button type="button" className="btn small" onClick={clearError}>
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

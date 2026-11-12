import { InlineConfirm } from '../shell/InlineConfirm';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SourceSummary } from '@trifold/api';
import { moveInOrder, placeInOrder, sourceOrder } from '@trifold/rules';
import { useTreeDnd, type TreeDnd } from '../../treeDnd';
import { useAppStore } from '../../stores/appStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';
import { BooksPanel, clashLine } from './BooksPanel';

/**
 * The Sources card, shown under Library › Compendium › Sources (DESIGN.md §6.1): every bundled
 * and imported source with its enabled flag, record counts and import warnings, the import's
 * progress (its button is in the page header, ADR 0025), and, on an imported file, which of its
 * books use 2024 rules (ADR 0028, DATA-FORMATS.md §2.10). Importing runs in main and reports progress over the
 * `importProgress` event; a source whose parser has moved on since it was imported is marked
 * stale and can be re-parsed.
 */
/** "species" stays as it is; "class" takes "es". */
function plural(kind: string, n: number): string {
  if (n === 1 || kind === 'species') return kind;
  return kind === 'class' ? 'classes' : `${kind}s`;
}

function counts(source: SourceSummary): string {
  const entries = Object.entries(source.recordCounts).filter(([, n]) => (n ?? 0) > 0);
  if (entries.length === 0) return 'no records';
  return entries.map(([k, n]) => `${n} ${plural(k, n ?? 0)}`).join(', ');
}

type Ordered = SourceSummary & { parentId: null; order: number; createdAt: string };
const flat = () => false;

function SourceRow({
  source,
  rank,
  dnd,
  onStep,
}: {
  source: Ordered;
  /** 1 is the highest priority (ADR 0027). */
  rank: number;
  dnd: TreeDnd<Ordered>;
  /** The keyboard's way to reorder: arrow keys on the focused handle. */
  onStep(step: -1 | 1): void;
}) {
  const setEnabled = useSourcesStore((s) => s.setEnabled);
  const remove = useSourcesStore((s) => s.remove);
  const reimport = useSourcesStore((s) => s.reimport);
  const importing = useSourcesStore((s) => s.importing);
  const [showWarnings, setShowWarnings] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showBooks, setShowBooks] = useState(false);
  const clash = clashLine(source);
  const rowRef = useRef<HTMLDivElement>(null);
  // The handle starts the drag; the whole row takes the drop.
  const { draggable, onDragStart, onDragEnd, ...dropProps } = dnd.rowProps(source);
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    onStep(e.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    <div
      ref={rowRef}
      className={`source-row${dnd.rowClass(source)}`}
      data-testid="source-row"
      data-source-id={source.id}
      {...dropProps}
    >
      <div className="row">
        <button
          type="button"
          className="chrome-btn xs drag-handle"
          aria-label={`Reorder ${source.name}, priority ${rank}`}
          title="Drag to change priority (or focus it and press the arrow keys)"
          draggable={draggable}
          onDragStart={(e) => {
            onDragStart(e);
            if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 16, 16);
          }}
          onDragEnd={onDragEnd}
          onKeyDown={onHandleKey}
        >
          <Icon name="grip" />
        </button>
        <span className="source-rank" aria-hidden="true">
          {rank}
        </span>
        <label>
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={(e) => void setEnabled(source.id, e.target.checked)}
          />
          <strong>{source.name}</strong>
        </label>
        {source.kind === 'homebrew' ? (
          <span className="badge">your own</span>
        ) : source.bundled ? (
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
            {source.review && (
              <button
                type="button"
                className={`chrome-btn xs${showBooks ? ' on' : ''}`}
                title="Choose which books use 2024 rules"
                aria-label={`2024 books in ${source.name}`}
                aria-pressed={showBooks}
                onClick={() => setShowBooks((v) => !v)}
              >
                <Icon name="tome" />
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
        {source.kind === 'homebrew'
          ? 'Records you made or copied with New homebrew and Duplicate to homebrew'
          : `${source.bundled ? 'Snapshot taken' : 'Imported'} ${new Date(source.importedAt).toLocaleString()} · default edition ${source.defaultEdition}`}
      </p>
      {clash && !showBooks && (
        <p className="source-clash" data-testid="source-clash">
          <span>⚠ {clash}</span>
          <button
            type="button"
            className="btn small"
            disabled={importing}
            onClick={() => setShowBooks(true)}
          >
            Choose 2024 books…
          </button>
        </p>
      )}
      {showBooks && <BooksPanel source={source} onClose={() => setShowBooks(false)} />}
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
  const setProgress = useSourcesStore((s) => s.setProgress);
  const clearError = useSourcesStore((s) => s.clearError);
  const library = useAppStore((s) => s.library);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const saved = library?.settings?.sourcePriority;
  const order = sourceOrder(sources, saved ?? []);
  const ranked: Ordered[] = [...sources]
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map((s, i) => ({ ...s, parentId: null, order: i, createdAt: s.importedAt }));
  const listRef = useRef<HTMLDivElement>(null);
  const save = async (next: string[]) => {
    await updateSettings({ sourcePriority: next });
    // The list and the open record may now answer from another source.
    void useCompendiumStore.getState().search();
  };
  const dnd = useTreeDnd<Ordered>({
    items: ranked,
    isFolder: flat,
    onMove: (id, _parentId, index) => void save(placeInOrder(order, id, index)),
  });
  const step = async (id: string, by: -1 | 1) => {
    await save(moveInOrder(order, id, by));
    // The row moved in the DOM; keep the keyboard on its handle.
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-source-id="${id}"] .drag-handle`)?.focus(),
    );
  };
  useEffect(() => {
    void load();
    return window.trifold.on('importProgress', setProgress);
  }, [load, setProgress]);

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
      <p className="muted">
        Bundled SRD content ships with the app. You can add compendium XML files in the format the
        Game Master and Fight Club apps use; they stay in this Library and are never sent anywhere.
      </p>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {importing && (
        <p className="muted" data-testid="import-progress">
          {progress
            ? `${progress.phase}${percent !== null ? ` ${percent}%` : ''}${progress.records ? ` · ${progress.records} records` : ''}`
            : 'starting…'}
        </p>
      )}
      {reportLine && (
        <p className="muted" data-testid="import-report">
          {reportLine}
        </p>
      )}
      <h2 className="mt">Priority order</h2>
      {sources.length === 0 ? (
        <p className="muted">No sources yet.</p>
      ) : (
        <>
          <div className="priority-notice" data-testid="priority-hint">
            <p>
              <strong>The top source wins.</strong> When a record is in more than one source, the
              compendium shows the version from the source highest in this list and marks the row
              with a <strong>+</strong>. The other versions are still on the record.
            </p>
            <p className="muted">Drag a source by its handle to change its place.</p>
          </div>
          <div ref={listRef} className={`source-list${dnd.containerClass}`} {...dnd.containerProps}>
            <p className="source-list-end muted small" aria-hidden="true">
              Highest priority
            </p>
            {ranked.map((s, i) => (
              <SourceRow
                key={s.id}
                source={s}
                rank={i + 1}
                dnd={dnd}
                onStep={(by) => void step(s.id, by)}
              />
            ))}
            <p className="source-list-end muted small" aria-hidden="true">
              Lowest priority
            </p>
          </div>
        </>
      )}
    </div>
  );
}

import { InlineConfirm } from '../shell/InlineConfirm';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CampaignSummary, SharingOverview, SourceSummary } from '@trifold/api';
import { moveInOrder, placeInOrder, sourceOrder } from '@trifold/rules';
import { useTreeDnd, type TreeDnd } from '../../treeDnd';
import { useAppStore } from '../../stores/appStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';
import { useCampaignStore } from '../../stores/campaignStore';
import { BooksPanel, clashLine } from './BooksPanel';
import { CampaignsPanel, campaignsLine } from './CampaignsPanel';
import { homebrewSharedLine, SharePanel, sharedLine } from './SharePanel';

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
  campaigns,
  sharing,
  onShare,
}: {
  source: Ordered;
  /** What every campaign shares with its players (ADR 0060); null until read. */
  sharing: SharingOverview | null;
  onShare(sourceId: string, campaignIds: string[]): void;
  /** Every campaign in the Library, for the campaigns a source shows in (ADR 0036). */
  campaigns: readonly CampaignSummary[];
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
  const [editing, setEditing] = useState(false);
  const setCampaigns = useSourcesStore((s) => s.setCampaigns);
  const openCampaignId = useCampaignStore((s) => s.current?.campaign.id ?? null);
  // Only an imported file can be limited to some campaigns (ADR 0036).
  const limitable = !source.bundled && (source.kind === 'xml' || source.kind === 'open5e');
  const changeCampaigns = async (ids: string[] | null) => {
    // The open campaign's lists may gain or lose this source's records.
    if (await setCampaigns(source.id, ids)) void useCompendiumStore.getState().search();
  };
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
                title={
                  showWarnings
                    ? 'Hide the import warnings'
                    : `${source.warnings.length} import ${source.warnings.length === 1 ? 'warning' : 'warnings'}: show`
                }
                aria-label={`Warnings for ${source.name}`}
                aria-pressed={showWarnings}
                onClick={() => setShowWarnings((v) => !v)}
              >
                <Icon name="warning" />
              </button>
            )}
            {limitable && (
              <button
                type="button"
                className={`chrome-btn xs${editing ? ' on' : ''}`}
                title="Edit source: its books and rules, the campaigns it shows in, and sharing"
                aria-label={`Edit ${source.name}`}
                aria-pressed={editing}
                onClick={() => setEditing((v) => !v)}
              >
                <Icon name="pencil" />
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
          ? 'Records you made or copied with New homebrew and Edit'
          : `${source.bundled ? 'Snapshot taken' : 'Imported'} ${new Date(source.importedAt).toLocaleString()} · default edition ${source.defaultEdition}`}
        {limitable && (
          <span data-testid="source-campaigns"> · {campaignsLine(source, campaigns)}</span>
        )}
        {limitable && sharedLine(source, campaigns, sharing) && (
          <span data-testid="source-shared"> · {sharedLine(source, campaigns, sharing)}</span>
        )}
        {source.kind === 'homebrew' && homebrewSharedLine(campaigns, sharing) && (
          <span data-testid="source-shared"> · {homebrewSharedLine(campaigns, sharing)}</span>
        )}
      </p>
      {editing && (
        <div
          className="edit-source"
          role="group"
          aria-label={`Edit ${source.name}`}
          data-testid="edit-source"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        >
          <div className="books-panel-head">
            <strong>Edit {source.name}</strong>
            <span className="spacer" />
            <button
              type="button"
              className="chrome-btn xs"
              aria-label="Close Edit source"
              title="Close"
              onClick={() => setEditing(false)}
            >
              <Icon name="close" />
            </button>
          </div>
          {source.review && (
            <BooksPanel source={source} embedded onClose={() => setEditing(false)} />
          )}
          <CampaignsPanel
            embedded
            source={source}
            campaigns={campaigns}
            openCampaignId={openCampaignId}
            onChange={(ids) => void changeCampaigns(ids)}
            onClose={() => setEditing(false)}
          />
          <SharePanel
            source={source}
            campaigns={campaigns}
            sharing={sharing}
            onChange={(ids) => onShare(source.id, ids)}
          />
        </div>
      )}
      {clash && !editing && (
        <p className="source-clash" data-testid="source-clash">
          <span>⚠ {clash}</span>
          <button
            type="button"
            className="btn small"
            disabled={importing}
            onClick={() => setEditing(true)}
          >
            Edit source…
          </button>
        </p>
      )}
      {showWarnings && <pre className="source-text warnings">{source.warnings.join('\n')}</pre>}
    </div>
  );
}

export function SourcesCard() {
  // What a GM shared with a joined campaign (ADR 0060) is not this Library's to manage.
  const all = useSourcesStore((s) => s.sources);
  const sources = useMemo(() => all.filter((s) => s.kind !== 'shared'), [all]);
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
  // What every campaign shares with its players (ADR 0060), so each row can say and change it.
  const [sharing, setSharing] = useState<SharingOverview | null>(null);
  useEffect(() => {
    let stale = false;
    void window.trifold.sources
      .sharing()
      .then((overview) => {
        if (!stale) setSharing(overview);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [sources]);
  const share = async (sourceId: string, campaignIds: string[]) => {
    try {
      setSharing(await window.trifold.sources.setShared(sourceId, campaignIds));
      // The open campaign's Shared sources tab, and what its table sends, follow its file.
      const open = useCampaignStore.getState().current?.campaign.id;
      if (open) await useCampaignStore.getState().load();
    } catch (err) {
      useSourcesStore.setState({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  const [campaigns, setCampaignList] = useState<CampaignSummary[]>([]);
  useEffect(() => {
    let live = true;
    window.trifold.campaigns
      .list()
      .then((list) => live && setCampaignList(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
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
                campaigns={campaigns}
                sharing={sharing}
                onShare={(id, ids) => void share(id, ids)}
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

import { InlineConfirm } from '../shell/InlineConfirm';
import { useEffect, useMemo, useState } from 'react';
import type { BookSummary, CampaignSummary, SharingOverview, SourceSummary } from '@trifold/api';
import { sourceOrder } from '@trifold/rules';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';
import { useCampaignStore } from '../../stores/campaignStore';
import { BooksPanel, clashLine } from './BooksPanel';
import { BooksView } from './BooksView';
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

function SourceRow({
  source,
  campaigns,
  sharing,
  onShare,
}: {
  source: SourceSummary;
  /** What every campaign shares with its players (ADR 0060); null until read. */
  sharing: SharingOverview | null;
  onShare(sourceId: string, campaignIds: string[]): void;
  /** Every campaign in the Library, for the campaigns a source shows in (ADR 0036). */
  campaigns: readonly CampaignSummary[];
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

  return (
    <div className="source-row" data-testid="source-row" data-source-id={source.id}>
      <div className="row">
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

export function SourcesCard({
  onBrowse = () => undefined,
}: {
  /** Opens the compendium limited to one book (ADR 0061). */
  onBrowse?(book: BookSummary): void;
} = {}) {
  const [tab, setTab] = useState<'books' | 'files'>('books');
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
  // The default order (ADR 0027): homebrew, imported files, then the SRD, 2024 first. Which copy
  // of a record answers is now set by starring books (ADR 0061), not by this list.
  const order = sourceOrder(sources, []);
  const ranked = [...sources].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const files = ranked.filter((s) => !s.bundled && s.kind !== 'homebrew');
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
      <div className="subtablist sources-tabs" role="tablist" aria-label="Sources">
        <button
          type="button"
          role="tab"
          className={`subtab${tab === 'books' ? ' active' : ''}`}
          aria-selected={tab === 'books'}
          onClick={() => setTab('books')}
        >
          Books
        </button>
        <button
          type="button"
          role="tab"
          className={`subtab${tab === 'files' ? ' active' : ''}`}
          aria-selected={tab === 'files'}
          onClick={() => setTab('files')}
        >
          Files ({ranked.length})
        </button>
      </div>
      {tab === 'books' ? (
        <BooksView
          files={files}
          onBrowse={onBrowse}
          campaigns={campaigns}
          sharing={sharing}
          onShared={setSharing}
        />
      ) : sources.length === 0 ? (
        <p className="muted">No sources yet.</p>
      ) : (
        <>
          <p className="muted small" data-testid="files-hint">
            What you imported, and what ships with Trifold. Re-parse, warnings, which campaigns see
            a file, sharing and removal live here; to choose which copy of a record is shown, star
            books on the Books tab.
          </p>
          <div className="source-list">
            {ranked.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                campaigns={campaigns}
                sharing={sharing}
                onShare={(id, ids) => void share(id, ids)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

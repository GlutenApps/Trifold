import { InlineConfirm } from '../shell/InlineConfirm';
import { useEffect, useMemo, useState } from 'react';
import type { BookSummary, CampaignSummary, SharingOverview, SourceSummary } from '@trifold/api';
import { sourceOrder } from '@trifold/rules';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { Icon } from '../shell/icons';
import { BooksView } from './BooksView';
import { DuplicatesView } from './DuplicatesView';

/**
 * The Sources card, shown under Library › Compendium › Sources (DESIGN.md §6.1), with three tabs:
 * Books (ADR 0061), Files and Duplicates (ADR 0063). Files is housekeeping for what was imported
 * (ADR 0067): each source's on switch, record counts, import warnings, Re-parse when the parser
 * has moved on, and Remove. Rules, sharing and where books show are set on books. Importing runs
 * in main and reports progress over the `importProgress` event (its button is in the page
 * header, ADR 0025).
 */

const NOUNS: Record<string, [string, string]> = {
  monster: ['monster', 'monsters'],
  spell: ['spell', 'spells'],
  item: ['item', 'items'],
  feat: ['feat', 'feats'],
  species: ['species', 'species'],
  background: ['background', 'backgrounds'],
  class: ['class', 'classes'],
  condition: ['condition', 'conditions'],
  rule: ['rule', 'rules'],
};

/** "14 monsters and 3 spells appear twice in this file…", or null when nothing clashes. */
export function clashLine(source: SourceSummary): string | null {
  const entries = Object.entries(source.review?.duplicates ?? {}).filter(([, n]) => (n ?? 0) > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, n]) => sum + (n ?? 0), 0);
  const parts = entries.map(([kind, n]) => {
    const [one, many] = NOUNS[kind] ?? [kind, `${kind}s`];
    return `${n} ${n === 1 ? one : many}`;
  });
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${list} ${total === 1 ? 'appears' : 'appear'} twice in this file, and nothing marks which copy uses 2024 rules.`;
}

/** What the Library's homebrew is shared in, for its row. */
export function homebrewSharedLine(
  campaigns: readonly CampaignSummary[],
  sharing: SharingOverview | null,
): string | null {
  const parts = campaigns
    .filter((c) => (sharing?.homebrewByCampaign[c.id] ?? 0) > 0)
    .map((c) => `${sharing!.homebrewByCampaign[c.id]!} in ${c.name}`);
  return parts.length ? `Shared with players: ${parts.join(', ')}` : null;
}

/** "Only in Silt Springs" for a file limited to some campaigns (ADR 0036), else null. */
export function limitedLine(
  source: Pick<SourceSummary, 'campaignIds'>,
  campaigns: readonly CampaignSummary[],
): string | null {
  if (!source.campaignIds) return null;
  const names = campaigns.filter((c) => source.campaignIds!.includes(c.id)).map((c) => c.name);
  return names.length === 0 ? 'In no campaign' : `Only in ${names.join(', ')}`;
}
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
  onShowBooks,
}: {
  source: SourceSummary;
  /** What every campaign shares with its players (ADR 0060); null until read. */
  sharing: SharingOverview | null;
  /** Every campaign in the Library, for the campaigns a limited file shows in (ADR 0036). */
  campaigns: readonly CampaignSummary[];
  /** Opens the Books tab, where rules and sharing are set. */
  onShowBooks(): void;
}) {
  const setEnabled = useSourcesStore((s) => s.setEnabled);
  const remove = useSourcesStore((s) => s.remove);
  const reimport = useSourcesStore((s) => s.reimport);
  const importing = useSourcesStore((s) => s.importing);
  const setCampaigns = useSourcesStore((s) => s.setCampaigns);
  const [showWarnings, setShowWarnings] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const clash = clashLine(source);
  // A campaign file's stat blocks start in their campaign only (ADR 0036); the DM can widen it.
  const limited = !source.bundled && source.kind === 'xml' ? limitedLine(source, campaigns) : null;
  const widen = async () => {
    // The open campaign's lists may gain this file's records.
    if (await setCampaigns(source.id, null)) void useCompendiumStore.getState().search();
  };

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
        {source.kind === 'homebrew' && homebrewSharedLine(campaigns, sharing) && (
          <span data-testid="source-shared"> · {homebrewSharedLine(campaigns, sharing)}</span>
        )}
      </p>
      {limited && (
        <p className="row source-limited" data-testid="source-campaigns">
          <span className="muted small">{limited}</span>
          <button
            type="button"
            className="btn small"
            aria-label={`Use ${source.name} in every campaign`}
            onClick={() => void widen()}
          >
            Use in every campaign
          </button>
        </p>
      )}
      {clash && (
        <p className="source-clash" data-testid="source-clash">
          <span>⚠ {clash}</span>
          <button type="button" className="btn small" onClick={onShowBooks}>
            Mark rules on Books…
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
  const [tab, setTab] = useState<'books' | 'files' | 'duplicates'>('books');
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
        <button
          type="button"
          role="tab"
          className={`subtab${tab === 'duplicates' ? ' active' : ''}`}
          aria-selected={tab === 'duplicates'}
          onClick={() => setTab('duplicates')}
        >
          Duplicates
        </button>
      </div>
      {tab === 'duplicates' ? (
        <DuplicatesView />
      ) : tab === 'books' ? (
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
            What you imported, and what ships with Trifold: switch a file on or off, re-parse it,
            read its import warnings or remove it. Rules, sharing, stars and collections are set on
            the Books tab.
          </p>
          <div className="source-list">
            {ranked.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                campaigns={campaigns}
                sharing={sharing}
                onShowBooks={() => setTab('books')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

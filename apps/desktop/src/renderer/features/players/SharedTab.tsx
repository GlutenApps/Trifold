import { useEffect, useState } from 'react';
import type { BookSummary, SourceSummary } from '@trifold/api';
import { campaignBooks } from '@trifold/rules';
import type {
  CampaignSettings,
  CompendiumRecord,
  LibrarySettings,
  RecordKind,
} from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useSourcesStore } from '../../stores/sourcesStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { tableOn, useTableStore } from '../../stores/tableStore';
import { ExportForPlayers } from './ExportForPlayers';
import { Icon } from '../shell/icons';

/**
 * Campaign › Shared sources (ADR 0060; docs/PLAYER-MODE.md, "Shared content"): what this
 * campaign's players are given to build and play their characters. Nothing is shared until the
 * GM turns it on here.
 *
 * - A book (ADR 0067) or collection the campaign uses: its spells, items, feats, species,
 *   backgrounds, classes, conditions and rules. Never its creatures. A campaign that shared
 *   whole files before books keeps them until the GM stops sharing them.
 * - Homebrew, record by record, turned on from the record's page in the Compendium.
 * - The stat blocks of the Companions list and of NPCs a player holds go by themselves.
 *
 * Players' copies of Trifold receive it when they are at the table, as a read-only source that
 * shows only in this campaign.
 */

const NO_COLLECTIONS: LibrarySettings['collections'] = [];

/** The kinds a shared source gives players (the table server's own list; ADR 0060). */
const PLAYER_FACING: readonly RecordKind[] = [
  'spell',
  'item',
  'feat',
  'species',
  'background',
  'class',
  'condition',
  'rule',
];

/**
 * A campaign's sharing choices. Files always carry them (the schema fills them in); a campaign
 * built in memory before ADR 0060 may not, and shares nothing.
 */
export function sharedOf(
  settings: Partial<Pick<CampaignSettings, 'shared'>>,
): CampaignSettings['shared'] {
  const shared = settings.shared;
  return {
    sourceIds: shared?.sourceIds ?? [],
    homebrewIds: shared?.homebrewIds ?? [],
    collectionIds: shared?.collectionIds ?? [],
    bookKeys: shared?.bookKeys ?? [],
  };
}

/** How many of a book's records players would get. */
export const bookPlayerFacing = (book: Pick<BookSummary, 'counts'>): number =>
  PLAYER_FACING.reduce((n, kind) => n + (book.counts[kind] ?? 0), 0);

/** How many of a source's records players would get. */
export const playerFacingCount = (source: Pick<SourceSummary, 'recordCounts'>): number =>
  PLAYER_FACING.reduce((n, kind) => n + (source.recordCounts[kind] ?? 0), 0);

/**
 * The name of the user-content source a homebrew record was made from, or null: a copy of an
 * imported record carries that record's text, so sharing it warns as sharing the source does.
 */
export function madeFromUserContent(
  record: Pick<CompendiumRecord, 'basedOn'>,
  sources: readonly Pick<SourceSummary, 'id' | 'name' | 'license'>[],
): string | null {
  const from = record.basedOn ? sources.find((s) => s.id === record.basedOn!.sourceId) : undefined;
  return from?.license.nonSrd ? from.name : null;
}

/** Whether a homebrew record can be shared by itself: any kind but a creature. */
export const canShareRecord = (record: Pick<CompendiumRecord, 'sourceId' | 'kind'>): boolean =>
  record.sourceId === 'homebrew' && record.kind !== 'monster';

export function SharedTab() {
  const campaign = useCampaignStore((s) => s.current?.campaign);
  const update = useCampaignStore((s) => s.update);
  const status = useTableStore((s) => s.status);
  const npcCompanions = useCampaignStore((s) => (s.current?.npcs ?? []).some((n) => n.companionOf));
  const collections = useAppStore((s) => s.library?.settings?.collections ?? NO_COLLECTIONS);
  const [sources, setSources] = useState<SourceSummary[] | null>(null);
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [homebrew, setHomebrew] = useState<Array<{ id: string; name: string | null }>>([]);
  const campaignId = campaign?.id;
  // The ids as text: the effect below runs when the list changes, not on every render.
  const homebrewKey = campaign ? sharedOf(campaign.settings).homebrewIds.join('\n') : '';

  useEffect(() => {
    let stale = false;
    void window.trifold.sources
      .list()
      .then((all) => {
        if (!stale) setSources(all);
      })
      .catch(() => {
        if (!stale) setSources([]);
      });
    void window.trifold.books
      .list()
      .then((all) => {
        if (!stale) setBooks(all);
      })
      .catch(() => {
        if (!stale) setBooks([]);
      });
    return () => {
      stale = true;
    };
  }, [campaignId]);

  useEffect(() => {
    let stale = false;
    void Promise.all(
      (homebrewKey ? homebrewKey.split('\n') : []).map(async (id) => {
        const record = await window.trifold.compendium.get(id).catch(() => null);
        return { id, name: record?.displayName ?? null };
      }),
    ).then((rows) => {
      if (!stale) setHomebrew(rows);
    });
    return () => {
      stale = true;
    };
  }, [homebrewKey]);

  if (!campaign) return null;
  const shared = sharedOf(campaign.settings);
  const usedCollections = collections
    .filter((c) => c.campaignIds.includes(campaign.id))
    .map((c) => c.name);
  const save = (next: CampaignSettings['shared']) =>
    update({ settings: { ...campaign.settings, shared: next } });

  // Books this campaign sees (on, and in its collections when it uses some) that hold anything
  // for players, not shared yet.
  const usedKeys = campaignBooks(collections, campaign.id);
  const sharedKeys = new Set(shared.bookKeys);
  const offered = (books ?? []).filter(
    (b) =>
      !b.off &&
      (!usedKeys || usedKeys.includes(b.key)) &&
      bookPlayerFacing(b) > 0 &&
      !sharedKeys.has(b.key),
  );
  const sharedBooks = shared.bookKeys.map((key) => ({
    key,
    book: (books ?? []).find((b) => b.key === key) ?? null,
  }));
  // Whole files shared before books (ADR 0067): kept until the GM stops sharing them.
  const sharedFiles = shared.sourceIds.map((id) => ({
    id,
    source: (sources ?? []).find((s) => s.id === id) ?? null,
  }));
  const userContent = (book: BookSummary) =>
    book.files.some((f) => (sources ?? []).find((s) => s.id === f.id)?.license.nonSrd);
  const sharingUserContent =
    sharedBooks.some((x) => x.book && userContent(x.book)) ||
    sharedFiles.some((x) => x.source?.license.nonSrd);

  return (
    <div className="shared-tab" data-testid="shared-tab">
      <p className="muted">
        What this campaign’s players are given to build and play their characters. Their copies of
        Trifold receive it at the table, to read only, and only in this campaign. Nothing is shared
        until you turn it on, and the SRD is never sent: every Trifold has it.
      </p>

      <p className="shared-now" role="status" data-testid="shared-now">
        {tableOn(status, campaign.id)
          ? `Players at your table have ${(status?.sharedRecords ?? 0).toLocaleString()} ${
              status?.sharedRecords === 1 ? 'record' : 'records'
            } from you now. A change here reaches them in a moment.`
          : 'Players receive this once you let them join and they are at the table.'}
      </p>

      <h2>Books</h2>
      <p className="muted small">
        A shared book gives players its spells, items, feats, species, backgrounds, classes,
        conditions and rules. Its creatures are never shared. Library › Compendium › Sources › Books
        can share many at once.
      </p>
      {sharedBooks.length === 0 && sharedFiles.length === 0 ? (
        <p className="muted">No books are shared.</p>
      ) : (
        <ul className="shared-list" aria-label="Books shared with players">
          {sharedBooks.map(({ key, book }) => {
            const name = book?.name ?? 'A book that is no longer in your Library';
            const count = book ? bookPlayerFacing(book) : 0;
            return (
              <li key={key} className="shared-row">
                <span className="grow">{book ? name : <span className="muted">{name}</span>}</span>
                {book && userContent(book) && <span className="badge">user content</span>}
                {book && (
                  <span className="muted small">
                    {count} {count === 1 ? 'record' : 'records'} for players
                  </span>
                )}
                <span className="row-actions">
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-label={`Stop sharing ${name}`}
                    title="Stop sharing"
                    onClick={() =>
                      void save({ ...shared, bookKeys: shared.bookKeys.filter((k) => k !== key) })
                    }
                  >
                    <Icon name="close" />
                  </button>
                </span>
              </li>
            );
          })}
          {sharedFiles.map(({ id, source }) => {
            const name = source ? `All of ${source.name}` : 'A file that is no longer imported';
            return (
              <li key={id} className="shared-row">
                <span className="grow">{name}</span>
                <span className="muted small">shared as a whole file</span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="chrome-btn xs"
                    aria-label={`Stop sharing ${name}`}
                    title="Stop sharing"
                    onClick={() =>
                      void save({
                        ...shared,
                        sourceIds: shared.sourceIds.filter((x) => x !== id),
                      })
                    }
                  >
                    <Icon name="close" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {books !== null && (
        <div className="row">
          <select
            aria-label="Share a book with players"
            value=""
            disabled={offered.length === 0}
            onChange={(e) => {
              if (e.target.value)
                void save({ ...shared, bookKeys: [...shared.bookKeys, e.target.value] });
            }}
          >
            <option value="">
              {offered.length === 0 ? 'No other book has anything for players' : 'Share a book…'}
            </option>
            {offered.map((b) => (
              <option key={b.key} value={b.key}>
                {b.name} ({bookPlayerFacing(b)} for players)
              </option>
            ))}
          </select>
        </div>
      )}
      {sharingUserContent && (
        <div className="banner warn wraps" role="note" aria-label="Sharing user content">
          <span>
            <strong>You are sharing a book marked as user content.</strong> It may hold text from
            outside the SRD. Share it only with players who are entitled to it; what a player has
            read cannot be taken back.
          </span>
        </div>
      )}

      <h2>Collections</h2>
      <p className="muted small">
        A shared collection gives players the same records from each of its books. Make and fill
        collections on Library › Compendium › Sources.
      </p>
      {collections.length === 0 ? (
        <p className="muted">No collections yet.</p>
      ) : (
        <ul className="shared-list" aria-label="Collections shared with players">
          {collections.map((c) => (
            <li key={c.id} className="shared-row">
              <label className="field inline grow">
                <input
                  type="checkbox"
                  aria-label={`Share ${c.name} with players`}
                  checked={shared.collectionIds.includes(c.id)}
                  onChange={(e) =>
                    void save({
                      ...shared,
                      collectionIds: e.target.checked
                        ? [...shared.collectionIds, c.id]
                        : shared.collectionIds.filter((id) => id !== c.id),
                    })
                  }
                />
                {c.name}
              </label>
              <span className="muted small">
                {c.bookKeys.length} {c.bookKeys.length === 1 ? 'book' : 'books'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {usedCollections.length > 0 && (
        <p className="muted small" data-testid="campaign-books">
          This campaign’s compendium shows only the books in {usedCollections.join(', ')}.
        </p>
      )}

      <h2>Homebrew</h2>
      <p className="muted small">
        Shared one record at a time, since a homebrew item can be as much a spoiler as a monster.
        Turn a record on from its page in the Compendium. Library › Compendium › Sources shows what
        every campaign shares.
      </p>
      {homebrew.length === 0 ? (
        <p className="muted">No homebrew is shared.</p>
      ) : (
        <ul className="shared-list" aria-label="Homebrew shared with players">
          {homebrew.map((h) => (
            <li key={h.id} className="shared-row">
              <span className="grow">
                {h.name ?? (
                  <span className="muted">A record that is no longer in the compendium</span>
                )}
              </span>
              <span className="row-actions">
                <button
                  type="button"
                  className="chrome-btn xs"
                  aria-label={`Stop sharing ${h.name ?? 'this record'}`}
                  title="Stop sharing"
                  onClick={() =>
                    void save({
                      ...shared,
                      homebrewIds: shared.homebrewIds.filter((id) => id !== h.id),
                    })
                  }
                >
                  <Icon name="close" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2>Creatures</h2>
      <p className="muted small">
        Players see the stat blocks of creatures on the Companions list and of NPCs they hold, and
        no others. Nothing comes from your encounters.
      </p>

      <ExportForPlayers
        sources={sharedFiles.flatMap((x) => (x.source ? [x.source] : []))}
        books={sharedBooks.flatMap((x) =>
          x.book ? [{ key: x.key, name: x.book.name, userContent: userContent(x.book) }] : [],
        )}
        collections={collections.filter((c) => shared.collectionIds.includes(c.id))}
        nothingShared={
          shared.sourceIds.length === 0 &&
          shared.bookKeys.length === 0 &&
          shared.homebrewIds.length === 0 &&
          shared.collectionIds.length === 0 &&
          (campaign.settings.summonable ?? []).length === 0 &&
          !npcCompanions
        }
      />
    </div>
  );
}

/**
 * Share with players, on a homebrew record's page in the Compendium while a campaign is open
 * (ADR 0060). Creatures are not shared this way: the Companions list is how one reaches players.
 */
export function ShareToggle({ record }: { record: CompendiumRecord }) {
  const campaign = useCampaignStore((s) => s.current?.campaign);
  const update = useCampaignStore((s) => s.update);
  const sources = useSourcesStore((s) => s.sources);
  const [asking, setAsking] = useState(false);
  if (!campaign || !canShareRecord(record)) return null;
  const shared = sharedOf(campaign.settings);
  const on = shared.homebrewIds.includes(record.id);
  // Homebrew made from an imported record carries that record's text (ADR 0060).
  const from = madeFromUserContent(record, sources);
  const setShared = (share: boolean) =>
    void update({
      settings: {
        ...campaign.settings,
        shared: {
          ...shared,
          homebrewIds: share
            ? [...shared.homebrewIds, record.id]
            : shared.homebrewIds.filter((id) => id !== record.id),
        },
      },
    });
  if (asking) {
    return (
      <span className="share-ask" role="group" aria-label={`Share ${record.displayName}?`}>
        <span className="warn-text small">
          Made from {from}, marked as user content: it may hold text from outside the SRD. Share it
          only with players who are entitled to it.
        </span>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setAsking(false);
            setShared(true);
          }}
        >
          Share
        </button>
        <button type="button" className="btn small" onClick={() => setAsking(false)}>
          Keep private
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`chrome-btn${on ? ' on' : ''}`}
      aria-label="Share with players"
      aria-pressed={on}
      title={
        on
          ? `${campaign.name}’s players have ${record.displayName}. Click to stop sharing`
          : `Share ${record.displayName} with ${campaign.name}’s players`
      }
      onClick={() => {
        if (!on && from) setAsking(true);
        else setShared(!on);
      }}
    >
      <Icon name="party" />
    </button>
  );
}

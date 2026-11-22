import { useState } from 'react';
import { ulid } from 'ulid';
import type { BookSummary, CampaignSummary, SharingOverview } from '@trifold/api';
import type { LibrarySettings } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCompendiumStore } from '../../stores/compendiumStore';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * Collections on the Books tab (ADR 0062): named groups of books. A campaign that uses a
 * collection shows only the imported books in the collections it uses while it is open; a
 * campaign that uses none shows every book. A collection can also be shared with a campaign's
 * players, which gives them its books' player-facing records at the table.
 */

export type Collection = LibrarySettings['collections'][number];

const NONE: readonly Collection[] = [];

/** The Library's collections, and a way to change them. */
export function useCollections(): {
  collections: readonly Collection[];
  save(next: Collection[]): Promise<void>;
} {
  const collections = useAppStore((s) => s.library?.settings?.collections ?? NONE);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return {
    collections,
    async save(next) {
      await updateSettings({ collections: next });
      // The open campaign's compendium may now show other books.
      void useCompendiumStore.getState().search();
    },
  };
}

/** "Used by Greyford, Silt Springs" or "Not used by a campaign". */
function usedLine(collection: Collection, campaigns: readonly CampaignSummary[]): string {
  const names = campaigns.filter((c) => collection.campaignIds.includes(c.id)).map((c) => c.name);
  return names.length ? `Used by ${names.join(', ')}` : 'Not used by a campaign';
}

export function CollectionsSection({
  books,
  campaigns,
  sharing,
  onShared,
  active,
  onPick,
}: {
  books: readonly BookSummary[];
  campaigns: readonly CampaignSummary[];
  sharing: SharingOverview | null;
  /** The sharing overview after a collection's sharing changed. */
  onShared(overview: SharingOverview): void;
  /** The collection the Books list is filtered to, or '' for none. */
  active: string;
  onPick(id: string): void;
}) {
  const { collections, save } = useCollections();
  const [editing, setEditing] = useState<string | null>(null);
  const [naming, setNaming] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = new Set(books.map((b) => b.key));

  const change = async (id: string, patch: Partial<Collection>) => {
    await save(collections.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const create = async () => {
    const name = naming.trim();
    if (!name) return;
    const made: Collection = { id: ulid(), name, bookKeys: [], campaignIds: [] };
    await save([...collections, made]);
    setNaming('');
    setEditing(made.id);
  };
  const remove = async (id: string) => {
    try {
      // No campaign goes on sharing a collection that is gone.
      onShared(await window.trifold.books.shareCollection(id, []));
      await save(collections.filter((c) => c.id !== id));
      if (active === id) onPick('');
      await reloadOpenCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const share = async (id: string, campaignIds: string[]) => {
    try {
      onShared(await window.trifold.books.shareCollection(id, campaignIds));
      await reloadOpenCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="collections" aria-label="Collections" data-testid="collections">
      <div className="row collections-head">
        <h3>Collections</h3>
        <span className="muted small">
          Group books. A campaign that uses collections shows only their books.
        </span>
      </div>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <ul className="collections-list">
        {collections.map((c) => {
          const count = c.bookKeys.filter((k) => known.has(k)).length;
          const sharedIn = sharing?.byCollection[c.id] ?? [];
          return (
            <li
              key={c.id}
              className={`collection-row${active === c.id ? ' active' : ''}`}
              data-testid="collection-row"
            >
              <div className="row">
                <button
                  type="button"
                  className="collection-name"
                  aria-pressed={active === c.id}
                  title={active === c.id ? 'Show every book' : 'Show only this collection’s books'}
                  onClick={() => onPick(active === c.id ? '' : c.id)}
                >
                  {c.name}
                </button>
                <span className="muted small">
                  {count} {count === 1 ? 'book' : 'books'} · {usedLine(c, campaigns)}
                  {sharedIn.length > 0 &&
                    ` · shared in ${campaigns
                      .filter((x) => sharedIn.includes(x.id))
                      .map((x) => x.name)
                      .join(', ')}`}
                </span>
                <span className="spacer" />
                {confirming === c.id ? (
                  <InlineConfirm
                    name={c.name}
                    onConfirm={() => {
                      setConfirming(null);
                      void remove(c.id);
                    }}
                    onKeep={() => setConfirming(null)}
                  />
                ) : (
                  <span className="row-actions">
                    <button
                      type="button"
                      className={`chrome-btn xs${editing === c.id ? ' on' : ''}`}
                      aria-label={`Edit ${c.name}`}
                      aria-pressed={editing === c.id}
                      title="Name, the campaigns that use it, and sharing"
                      onClick={() => setEditing(editing === c.id ? null : c.id)}
                    >
                      <Icon name="pencil" />
                    </button>
                    <button
                      type="button"
                      className="chrome-btn xs danger"
                      aria-label={`Delete ${c.name}`}
                      title="Delete the collection; its books stay"
                      onClick={() => setConfirming(c.id)}
                    >
                      <Icon name="trash" />
                    </button>
                  </span>
                )}
              </div>
              {editing === c.id && (
                <div
                  className="edit-source collection-edit"
                  role="group"
                  aria-label={`Edit ${c.name}`}
                >
                  <label className="field inline">
                    Name
                    <input
                      type="text"
                      aria-label="Collection name"
                      defaultValue={c.name}
                      maxLength={80}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== c.name) void change(c.id, { name });
                      }}
                    />
                  </label>
                  <section className="edit-source-section" aria-label={`Campaigns using ${c.name}`}>
                    <h3>Used by</h3>
                    <p className="muted small">
                      While a ticked campaign is open, its compendium shows only the books in the
                      collections it uses. The SRD and homebrew always show.
                    </p>
                    <CampaignChecks
                      campaigns={campaigns}
                      ticked={c.campaignIds}
                      onChange={(ids) => void change(c.id, { campaignIds: ids })}
                    />
                  </section>
                  <section
                    className="edit-source-section"
                    aria-label={`Share ${c.name} with players`}
                  >
                    <h3>Shared with players</h3>
                    <p className="muted small">
                      Players in a ticked campaign get these books’ spells, items, feats, species,
                      backgrounds, classes, conditions and rules at the table. Never creatures.
                    </p>
                    <CampaignChecks
                      campaigns={campaigns}
                      ticked={sharedIn}
                      disabled={sharing === null}
                      onChange={(ids) => void share(c.id, ids)}
                    />
                  </section>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          type="text"
          className="grow"
          aria-label="New collection name"
          placeholder="New collection, such as Core rules"
          maxLength={80}
          value={naming}
          onChange={(e) => setNaming(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!naming.trim()}>
          <Icon name="plus" />
          New collection
        </button>
      </form>
    </section>
  );
}

function CampaignChecks({
  campaigns,
  ticked,
  disabled = false,
  onChange,
}: {
  campaigns: readonly CampaignSummary[];
  ticked: readonly string[];
  disabled?: boolean;
  onChange(ids: string[]): void;
}) {
  if (campaigns.length === 0) return <p className="muted">No campaigns yet.</p>;
  return (
    <ul className="books-list">
      {campaigns.map((c) => (
        <li key={c.id}>
          <label>
            <input
              type="checkbox"
              checked={ticked.includes(c.id)}
              disabled={disabled}
              onChange={(e) =>
                onChange(e.target.checked ? [...ticked, c.id] : ticked.filter((id) => id !== c.id))
              }
            />
            {c.name}
          </label>
        </li>
      ))}
    </ul>
  );
}

/** The open campaign's file changed in main: its Shared sources tab and its table follow. */
async function reloadOpenCampaign(): Promise<void> {
  if (useCampaignStore.getState().current) await useCampaignStore.getState().load();
}

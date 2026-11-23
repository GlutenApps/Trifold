import { useEffect, useRef, useState } from 'react';
import type { BookSummary, CampaignSummary, SharingOverview, SourceSummary } from '@trifold/api';
import { errorMessage } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { Icon } from '../shell/icons';

/**
 * Share with players, for books (ADR 0067): one checkbox per campaign. A ticked campaign's
 * players get the books' spells, items, feats, species, backgrounds, classes, conditions and
 * rules at the table; never their creatures. Opened from a book's row or for a selection on the
 * Books tab.
 */

/** Whether every one of `keys` is shared in a campaign, some are, or none. */
export function sharedState(
  keys: readonly string[],
  campaignId: string,
  sharing: SharingOverview | null,
): 'all' | 'some' | 'none' {
  const n = keys.filter((k) => sharing?.byBook[k]?.includes(campaignId)).length;
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some';
}

/** "Shared in Greyford, Silt Springs", or null when no campaign shares the book. */
export function bookSharedLine(
  key: string,
  campaigns: readonly CampaignSummary[],
  sharing: SharingOverview | null,
): string | null {
  const ids = sharing?.byBook[key] ?? [];
  const names = campaigns.filter((c) => ids.includes(c.id)).map((c) => c.name);
  return names.length ? `Shared in ${names.join(', ')}` : null;
}

function CampaignCheck({
  campaign,
  state,
  onChange,
}: {
  campaign: CampaignSummary;
  state: 'all' | 'some' | 'none';
  onChange(on: boolean): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <li>
      <label>
        <input
          ref={ref}
          type="checkbox"
          checked={state === 'all'}
          onChange={(e) => onChange(e.target.checked)}
        />
        {campaign.name}
        {state === 'some' && <span className="muted small"> · some of them</span>}
      </label>
    </li>
  );
}

export function ShareBooksPanel({
  books,
  campaigns,
  sources,
  sharing,
  onShared,
  onClose,
}: {
  books: readonly BookSummary[];
  campaigns: readonly CampaignSummary[];
  /** The Library's sources, for which books come from files marked as user content. */
  sources: readonly Pick<SourceSummary, 'id' | 'license'>[];
  sharing: SharingOverview | null;
  onShared(overview: SharingOverview): void;
  onClose(): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const keys = books.map((b) => b.key);
  const label = books.length === 1 ? books[0]!.name : `${books.length} books`;
  const userContent = books.some((b) =>
    b.files.some((f) => sources.find((s) => s.id === f.id)?.license.nonSrd),
  );
  const change = async (campaignId: string, on: boolean) => {
    setError(null);
    try {
      onShared(await window.trifold.books.share(keys, campaignId, on));
      // The open campaign's Shared sources tab, and what its table sends, follow its file.
      if (useCampaignStore.getState().current) await useCampaignStore.getState().load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <section
      className="edit-source share-books"
      aria-label={`Share ${label} with players`}
      data-testid="share-books"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="books-panel-head">
        <strong>Share {label} with players</strong>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close Share with players"
          title="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted small">
        Players in a ticked campaign get {books.length === 1 ? 'its' : 'their'} spells, items,
        feats, species, backgrounds, classes, conditions and rules at the table. Never creatures.
      </p>
      {userContent && (
        <p className="warn-text small" role="note">
          Marked as user content: it may hold text from outside the SRD. Share it only with players
          who are entitled to it.
        </p>
      )}
      {error && (
        <p className="small join-problem" role="alert">
          {error}
        </p>
      )}
      {campaigns.length === 0 ? (
        <p className="muted">No campaigns yet.</p>
      ) : (
        <ul className="books-list">
          {campaigns.map((c) => (
            <CampaignCheck
              key={c.id}
              campaign={c}
              state={sharedState(keys, c.id, sharing)}
              onChange={(on) => void change(c.id, on)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

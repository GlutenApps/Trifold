import type { CampaignSummary, SharingOverview, SourceSummary } from '@trifold/api';

/**
 * Which campaigns share an imported source with their players (ADR 0060), inside Edit source on
 * Library › Compendium › Sources: the same choice as a campaign's Shared sources tab, made
 * for every campaign at once. A campaign that does not show the source cannot share it.
 */

/** The campaigns that share a source, as the line under its row says. */
export function sharedLine(
  source: Pick<SourceSummary, 'id'>,
  campaigns: readonly CampaignSummary[],
  sharing: SharingOverview | null,
): string | null {
  const ids = sharing?.bySource[source.id] ?? [];
  const names = campaigns.filter((c) => ids.includes(c.id)).map((c) => c.name);
  return names.length ? `Shared with players in ${names.join(', ')}` : null;
}

/** What the Library's homebrew is shared in, for its row. */
export function homebrewSharedLine(
  campaigns: readonly CampaignSummary[],
  sharing: SharingOverview | null,
): string | null {
  const parts = campaigns
    .filter((c) => (sharing?.homebrewByCampaign[c.id] ?? 0) > 0)
    .map((c) => {
      const n = sharing!.homebrewByCampaign[c.id]!;
      return `${n} in ${c.name}`;
    });
  return parts.length ? `Shared with players: ${parts.join(', ')}` : null;
}

export function SharePanel({
  source,
  campaigns,
  sharing,
  onChange,
}: {
  source: SourceSummary;
  campaigns: readonly CampaignSummary[];
  sharing: SharingOverview | null;
  onChange(campaignIds: string[]): void;
}) {
  const ticked = sharing?.bySource[source.id] ?? [];
  const sees = (c: CampaignSummary) => !source.campaignIds || source.campaignIds.includes(c.id);
  const offered = campaigns.filter(sees);
  return (
    <section className="edit-source-section" aria-label={`Share ${source.name} with players`}>
      <h3>Shared with players</h3>
      <p className="muted small">
        Players in a ticked campaign get this source’s spells, items, feats, species, backgrounds,
        classes, conditions and rules at the table. Never its creatures.
      </p>
      {source.license.nonSrd && ticked.length > 0 && (
        <p className="warn-text small" role="note">
          This source is marked as user content and may hold text from outside the SRD. Share it
          only with players who are entitled to it.
        </p>
      )}
      {offered.length === 0 ? (
        <p className="muted">No campaign shows this source.</p>
      ) : (
        <ul className="books-list">
          {offered.map((c) => (
            <li key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={ticked.includes(c.id)}
                  disabled={sharing === null}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...ticked, c.id] : ticked.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

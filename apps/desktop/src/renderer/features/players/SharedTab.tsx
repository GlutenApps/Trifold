import { useEffect, useState } from 'react';
import type { SourceSummary } from '@trifold/api';
import type { CampaignSettings, CompendiumRecord, RecordKind } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { Icon } from '../shell/icons';

/**
 * Campaign › Shared with players (ADR 0060; docs/PLAYER-MODE.md, "Shared content"): what this
 * campaign's players are given to build and play their characters. Nothing is shared until the
 * GM turns it on here.
 *
 * - An imported source the campaign uses: its spells, items, feats, species, backgrounds,
 *   classes, conditions and rules. Never its creatures.
 * - Homebrew, record by record, turned on from the record's page in the Compendium.
 * - The stat blocks of the Companions list and of NPCs a player holds go by themselves.
 *
 * Players' copies of Trifold receive it when they are at the table, as a read-only source that
 * shows only in this campaign.
 */

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
  return settings.shared ?? { sourceIds: [], homebrewIds: [] };
}

/** How many of a source's records players would get. */
export const playerFacingCount = (source: Pick<SourceSummary, 'recordCounts'>): number =>
  PLAYER_FACING.reduce((n, kind) => n + (source.recordCounts[kind] ?? 0), 0);

/** Whether a homebrew record can be shared by itself: any kind but a creature. */
export const canShareRecord = (record: Pick<CompendiumRecord, 'sourceId' | 'kind'>): boolean =>
  record.sourceId === 'homebrew' && record.kind !== 'monster';

export function SharedTab() {
  const campaign = useCampaignStore((s) => s.current?.campaign);
  const update = useCampaignStore((s) => s.update);
  const [sources, setSources] = useState<SourceSummary[] | null>(null);
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
  const save = (next: CampaignSettings['shared']) =>
    update({ settings: { ...campaign.settings, shared: next } });

  // Imported sources this campaign sees and that are switched on in the Library.
  const offered = (sources ?? []).filter(
    (s) =>
      !s.bundled &&
      (s.kind === 'xml' || s.kind === 'open5e') &&
      s.enabled &&
      (!s.campaignIds || s.campaignIds.includes(campaign.id)),
  );
  const on = new Set(shared.sourceIds);
  const sharingUserContent = offered.some((s) => on.has(s.id) && s.license.nonSrd);

  return (
    <div className="shared-tab" data-testid="shared-tab">
      <p className="muted">
        What this campaign’s players are given to build and play their characters. Their copies of
        Trifold receive it at the table, to read only, and only in this campaign. Nothing is shared
        until you turn it on, and the SRD is never sent: every Trifold has it.
      </p>

      <h2>Sources</h2>
      <p className="muted small">
        A shared source gives players its spells, items, feats, species, backgrounds, classes,
        conditions and rules. Its creatures are never shared.
      </p>
      {sources !== null && offered.length === 0 && (
        <p className="muted">This campaign uses no imported sources.</p>
      )}
      <ul className="shared-list" aria-label="Sources shared with players">
        {offered.map((s) => {
          const count = playerFacingCount(s);
          return (
            <li key={s.id} className="shared-row">
              <label className="field inline grow">
                <input
                  type="checkbox"
                  aria-label={`Share ${s.name} with players`}
                  checked={on.has(s.id)}
                  disabled={count === 0}
                  onChange={(e) =>
                    void save({
                      ...shared,
                      sourceIds: e.target.checked
                        ? [...shared.sourceIds, s.id]
                        : shared.sourceIds.filter((id) => id !== s.id),
                    })
                  }
                />
                {s.name}
              </label>
              {s.license.nonSrd && <span className="badge">user content</span>}
              <span className="muted small">
                {count === 0
                  ? 'nothing for players in it'
                  : `${count} ${count === 1 ? 'record' : 'records'} for players`}
              </span>
            </li>
          );
        })}
      </ul>
      {sharingUserContent && (
        <div className="banner warn wraps" role="note" aria-label="Sharing user content">
          <span>
            <strong>You are sharing a source marked as user content.</strong> It may hold text from
            outside the SRD. Share it only with players who are entitled to it; what a player has
            read cannot be taken back.
          </span>
        </div>
      )}

      <h2>Homebrew</h2>
      <p className="muted small">
        Shared one record at a time, since a homebrew item can be as much a spoiler as a monster.
        Turn a record on from its page in the Compendium.
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
  if (!campaign || !canShareRecord(record)) return null;
  const shared = sharedOf(campaign.settings);
  const on = shared.homebrewIds.includes(record.id);
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
      onClick={() =>
        void update({
          settings: {
            ...campaign.settings,
            shared: {
              ...shared,
              homebrewIds: on
                ? shared.homebrewIds.filter((id) => id !== record.id)
                : [...shared.homebrewIds, record.id],
            },
          },
        })
      }
    >
      <Icon name="party" />
    </button>
  );
}

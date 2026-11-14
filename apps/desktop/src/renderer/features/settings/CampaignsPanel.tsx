import { useEffect, useRef } from 'react';
import type { CampaignSummary, SourceSummary } from '@trifold/api';
import { Icon } from '../shell/icons';

/**
 * Which campaigns an imported source shows in (ADR 0036), under its row on the Sources page:
 * every campaign, or only the ticked ones. Each change is saved at once; the last ticked
 * campaign cannot be unticked, so a limited source always shows somewhere.
 */

/** The line under a source's row: where it shows. */
export function campaignsLine(
  source: Pick<SourceSummary, 'campaignIds'>,
  campaigns: readonly CampaignSummary[],
): string {
  if (!source.campaignIds) return 'Every campaign';
  const names = campaigns.filter((c) => source.campaignIds!.includes(c.id)).map((c) => c.name);
  return names.length === 0 ? 'No campaign' : `Only ${names.join(', ')}`;
}

export function CampaignsPanel({
  source,
  campaigns,
  openCampaignId,
  onChange,
  onClose,
}: {
  source: SourceSummary;
  campaigns: readonly CampaignSummary[];
  /** The open campaign, ticked first when the source is limited. */
  openCampaignId: string | null;
  onChange(campaignIds: string[] | null): void;
  onClose(): void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, []);
  const known = new Set(campaigns.map((c) => c.id));
  const ticked = (source.campaignIds ?? []).filter((id) => known.has(id));
  const limited = source.campaignIds != null;
  const firstChoice = openCampaignId ?? campaigns[0]?.id ?? null;

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...ticked, id] : ticked.filter((t) => t !== id);
    if (next.length > 0) onChange(next);
  };

  return (
    <div
      ref={panelRef}
      className="books-panel"
      role="group"
      aria-label={`Campaigns for ${source.name}`}
      data-testid="campaigns-panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="books-panel-head">
        <strong>Which campaigns show it?</strong>
        <span className="spacer" />
        <button
          type="button"
          className="chrome-btn xs"
          aria-label="Close campaigns"
          title="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted small">
        Its records appear in the compendium, the encounter builder and search only while one of
        these campaigns is open. With no campaign open, every source shows.
      </p>
      <ul className="books-list">
        <li>
          <label>
            <input
              type="radio"
              name={`campaigns-${source.id}`}
              checked={!limited}
              onChange={() => onChange(null)}
            />
            Every campaign
          </label>
        </li>
        <li>
          <label>
            <input
              type="radio"
              name={`campaigns-${source.id}`}
              checked={limited}
              disabled={!firstChoice}
              onChange={() => firstChoice && onChange(ticked.length ? ticked : [firstChoice])}
            />
            Only these campaigns
          </label>
        </li>
      </ul>
      {limited && (
        <ul className="books-list campaigns-list">
          {campaigns.map((c) => {
            const on = ticked.includes(c.id);
            return (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={on && ticked.length === 1}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                  />
                  {c.name}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

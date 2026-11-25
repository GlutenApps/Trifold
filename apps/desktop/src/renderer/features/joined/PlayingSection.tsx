import { useState } from 'react';
import { matchesCampaignFilter, openedAgo } from '@trifold/rules';
import { useJoinedStore } from '../../stores/joinedStore';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * Library › Campaigns › Playing (docs/PLAYER-MODE.md, "The campaign list"): the campaigns this
 * Library has joined, most recently opened first, each with Open, when it was last opened and
 * last at the table, and Leave. `filter` is the Campaigns page's filter by name. The list shows what the
 * Library knows and connects to nothing: whether a GM's table is up is found out only when the
 * player opens the campaign.
 */
export function PlayingSection({ filter = '' }: { filter?: string }) {
  const joined = useJoinedStore((s) => s.joined);
  const leave = useJoinedStore((s) => s.leave);
  const current = useJoinedStore((s) => s.current);
  const openCampaign = useJoinedStore((s) => s.openCampaign);
  const [leaving, setLeaving] = useState<string | null>(null);

  if (joined.length === 0) return null;
  const shown = joined.filter((j) =>
    matchesCampaignFilter(j.campaignName || 'Unnamed campaign', filter),
  );
  return (
    <>
      <h2>Playing</h2>
      {shown.length === 0 && (
        <p className="muted">No campaigns you play in match “{filter.trim()}”.</p>
      )}
      <div className="campaign-grid" data-testid="playing-campaigns">
        {shown.map((j) => {
          const title = j.campaignName || 'Unnamed campaign';
          return (
            <div
              key={j.campaignId}
              className={`card campaign-card${current?.campaignId === j.campaignId ? ' live' : ''}`}
            >
              <div className="row">
                <strong className="campaign-card-name">{title}</strong>
                <span className="spacer" />
                <span className="muted small">
                  {j.openedAt ? `opened ${openedAgo(j.openedAt)}` : 'not opened yet'}
                </span>
              </div>
              <p className="muted small">
                {j.displayName ? `Playing as ${j.displayName}` : 'No name set'}
                {j.claimed ? ' · character picked' : ''}
                {' · '}
                {j.lastLiveAt
                  ? `last at the table ${new Date(j.lastLiveAt).toLocaleDateString()}`
                  : 'not at the table yet'}
              </p>
              <div className="row">
                <button
                  type="button"
                  className="btn primary"
                  aria-label={`${current?.campaignId === j.campaignId ? 'Back to' : 'Open'} ${title}`}
                  onClick={() => void openCampaign(j.campaignId)}
                >
                  {current?.campaignId === j.campaignId ? 'Back to console' : 'Open'}
                </button>
                <span className="spacer" />
                {leaving === j.campaignId ? (
                  <InlineConfirm
                    name={title}
                    verb="Leave"
                    question={`Leave ${title}? Your notes for it are deleted.`}
                    onConfirm={() => {
                      setLeaving(null);
                      void leave(j.campaignId);
                    }}
                    onKeep={() => setLeaving(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="chrome-btn danger"
                    title="Leave campaign…"
                    aria-label={`Leave ${title}…`}
                    onClick={() => setLeaving(j.campaignId)}
                  >
                    <Icon name="door" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

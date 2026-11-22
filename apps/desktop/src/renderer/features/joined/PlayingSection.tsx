import { useState } from 'react';
import { useJoinedStore } from '../../stores/joinedStore';
import { Icon } from '../shell/icons';
import { InlineConfirm } from '../shell/InlineConfirm';

/**
 * Library › Campaigns › Playing (docs/PLAYER-MODE.md, "The campaign list"): the campaigns this
 * Library has joined, each with Open, when it was last at the table, and Leave. The list shows what the
 * Library knows and connects to nothing: whether a GM's table is up is found out only when the
 * player opens the campaign.
 */
export function PlayingSection() {
  const joined = useJoinedStore((s) => s.joined);
  const leave = useJoinedStore((s) => s.leave);
  const current = useJoinedStore((s) => s.current);
  const openCampaign = useJoinedStore((s) => s.openCampaign);
  const [leaving, setLeaving] = useState<string | null>(null);

  if (joined.length === 0) return null;
  return (
    <>
      <h2>Playing</h2>
      <div className="campaign-grid" data-testid="playing-campaigns">
        {joined.map((j) => {
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
                  {j.lastLiveAt
                    ? `last at the table ${new Date(j.lastLiveAt).toLocaleDateString()}`
                    : 'not at the table yet'}
                </span>
              </div>
              <p className="muted small">
                {j.displayName ? `Playing as ${j.displayName}` : 'No name set'}
                {j.claimed ? ' · character picked' : ''}
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

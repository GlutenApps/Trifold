import { useState } from 'react';
import type { CampaignSummary } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { deleteCampaign, switchCampaign } from '../shell/campaignFlow';

/** Inline confirm on a campaign card: the DM types DELETE before the folder goes. */
function DeleteCampaignConfirm({
  campaign,
  onCancel,
}: {
  campaign: CampaignSummary;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const ready = typed === 'DELETE';
  return (
    <form
      className="campaign-delete"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) deleteCampaign(campaign.id, campaign.slug);
      }}
    >
      <p className="small">
        Delete <strong>{campaign.name}</strong> and everything in it: party, adventures, NPCs,
        notes, encounters, scenes and images. Type DELETE to confirm.
      </p>
      <div className="row">
        <input
          type="text"
          aria-label={`Type DELETE to delete ${campaign.name}`}
          placeholder="DELETE"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
        />
        <button type="submit" className="btn small danger" disabled={!ready}>
          Delete campaign
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Keep
        </button>
      </div>
    </form>
  );
}

/** Library › Campaigns: create, import, open. Opening one enters the console. */
export function CampaignsPage() {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const current = useCampaignStore((s) => s.current);
  const create = useCampaignStore((s) => s.create);
  const importXml = useCampaignStore((s) => s.importXml);
  const importing = useCampaignStore((s) => s.importing);
  const lastImport = useCampaignStore((s) => s.lastImport);
  const error = useCampaignStore((s) => s.error);
  const clearError = useCampaignStore((s) => s.clearError);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <section className="campaigns-page">
      <div className="row">
        <h1>Campaigns</h1>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          disabled={importing}
          onClick={() => void importXml('new')}
        >
          Import campaign XML…
        </button>
      </div>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {lastImport && (
        <p className="muted" data-testid="campaign-import-report">
          {lastImport.mode === 'new' ? 'Imported' : 'Merged'} {lastImport.name}:{' '}
          {lastImport.counts.pcs} PCs, {lastImport.counts.npcs} NPCs, {lastImport.counts.notes}{' '}
          notes, {lastImport.counts.adventures} adventures, {lastImport.counts.encounters}{' '}
          encounters
          {lastImport.warnings.length
            ? ` · ${lastImport.warnings.length} warnings: ${lastImport.warnings.join('; ')}`
            : ''}
        </p>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) {
            void create(newName.trim());
            setNewName('');
          }
        }}
      >
        <input
          type="text"
          aria-label="New campaign name"
          placeholder="New campaign name"
          className="wide-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={!newName.trim()}>
          Create campaign
        </button>
      </form>
      {campaigns.length === 0 ? (
        <p className="muted">No campaigns yet. Create one above.</p>
      ) : (
        <div className="campaign-grid">
          {campaigns.map((c) => {
            const isCurrent = current?.campaign.id === c.id;
            return (
              <div key={c.id} className={`card campaign-card${isCurrent ? ' live' : ''}`}>
                <div className="row">
                  <strong className="campaign-card-name">{c.name}</strong>
                  <span className="spacer" />
                  <span className="muted small">
                    updated {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="muted small">
                  {c.pcCount} PCs · {c.encounterCount} encounters
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={() => switchCampaign(c.id)}
                  >
                    {isCurrent ? 'Back to console' : 'Open'}
                  </button>
                  {isCurrent && (
                    <button
                      type="button"
                      className="btn small"
                      disabled={importing}
                      onClick={() => void importXml('merge')}
                    >
                      Import into this campaign…
                    </button>
                  )}
                  <span className="spacer" />
                  {deleting !== c.id && (
                    <button
                      type="button"
                      className="btn small"
                      aria-label={`Delete ${c.name}…`}
                      onClick={() => setDeleting(c.id)}
                    >
                      Delete…
                    </button>
                  )}
                </div>
                {deleting === c.id && (
                  <DeleteCampaignConfirm campaign={c} onCancel={() => setDeleting(null)} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">
        A campaign holds its party, adventures, NPCs, notes, encounters, scenes and playlists.
        Opening one enters the console with its tabs, dock and layouts as you left them; the Library
        stays a click away on the mark.
      </p>
    </section>
  );
}

import { useState } from 'react';
import type { CampaignSummary } from '@trifold/api';
import { useCampaignStore } from '../../stores/campaignStore';
import { deleteCampaign, switchCampaign } from '../shell/campaignFlow';
import { Icon } from '../shell/icons';
import { CampaignExportPanel, useCampaignPackageImport } from './CampaignPackages';

/**
 * Library › Campaigns: one Create campaign button opens the three ways in (a blank campaign, a
 * Trifold campaign file, a Game Master XML file), and a card per campaign with Open (Back to console for the open one), Import into this
 * campaign, Export campaign inline in the card (ADR 0015) and a typed-DELETE removal. Opening a
 * campaign leaves the Library for the console (ADR 0004).
 */

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
        Delete <strong>{campaign.name}</strong> and everything in it: party, NPCs, notes,
        encounters, scenes and images. Type DELETE to confirm.
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
        <button type="submit" className="btn danger" disabled={!ready}>
          Delete campaign
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Keep
        </button>
      </div>
    </form>
  );
}

/**
 * The panel under Create campaign: a name and Create for a blank campaign, then the two
 * imports. Game Master has a help button, since many DMs have never heard of it.
 */
function CreateCampaignPanel({
  onClose,
  importPackage,
  packageBusy,
}: {
  onClose: () => void;
  importPackage: () => void;
  packageBusy: boolean;
}) {
  const create = useCampaignStore((s) => s.create);
  const importXml = useCampaignStore((s) => s.importXml);
  const importing = useCampaignStore((s) => s.importing);
  const [name, setName] = useState('');
  const [help, setHelp] = useState(false);
  return (
    <div
      className="card campaign-create"
      data-testid="campaign-create"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <form
        className="campaign-create-way"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create(name.trim());
        }}
      >
        <strong>New blank campaign</strong>
        <p className="muted small">
          Start empty and add the party, notes and encounters as you go.
        </p>
        <div className="row">
          <input
            type="text"
            aria-label="New campaign name"
            placeholder="Campaign name"
            className="wide-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
      <div className="campaign-create-way">
        <strong>Import a Trifold campaign</strong>
        <p className="muted small">
          A .trifold-campaign file exported from Trifold, on this computer or another one.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={packageBusy}
            onClick={() => {
              onClose();
              importPackage();
            }}
          >
            Choose Trifold file…
          </button>
        </div>
      </div>
      <div className="campaign-create-way">
        <div className="row">
          <strong>Import from Game Master</strong>
          <button
            type="button"
            className="chrome-btn xs"
            aria-label="What is Game Master?"
            title="What is Game Master?"
            aria-expanded={help}
            onClick={() => setHelp((v) => !v)}
          >
            <Icon name="help" />
          </button>
        </div>
        <p className="muted small">
          A campaign XML file exported from the Game Master app: its party, NPCs, notes and
          encounters.
        </p>
        {help && (
          <p className="small campaign-create-help" data-testid="game-master-help">
            Game Master 5th Edition is a separate app for DMs, made by Lion’s Den. If you kept a
            campaign in it, export the campaign there as an XML file and choose that file here.
            Trifold only reads the file; nothing in Game Master changes. Compendium XML for the same
            app goes in Compendium › Sources, and a Fight Club GM export of one character goes into
            a campaign from its Party tab.
          </p>
        )}
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={importing}
            onClick={() => {
              onClose();
              void importXml('new');
            }}
          >
            Choose XML file…
          </button>
        </div>
      </div>
    </div>
  );
}

/** Library › Campaigns: create, import, open. Opening one enters the console. */
export function CampaignsPage() {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const current = useCampaignStore((s) => s.current);
  const importXml = useCampaignStore((s) => s.importXml);
  const importing = useCampaignStore((s) => s.importing);
  const lastImport = useCampaignStore((s) => s.lastImport);
  const error = useCampaignStore((s) => s.error);
  const clearError = useCampaignStore((s) => s.clearError);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const packageImport = useCampaignPackageImport();

  return (
    <section className="campaigns-page">
      <div className="row">
        <h1>Campaigns</h1>
        <span className="spacer" />
        <button
          type="button"
          className={`btn primary${creating ? ' on' : ''}`}
          aria-expanded={creating}
          onClick={() => setCreating((v) => !v)}
        >
          <Icon name="plus" />
          Create campaign
        </button>
      </div>
      {creating && (
        <CreateCampaignPanel
          onClose={() => setCreating(false)}
          importPackage={() => void packageImport.pick()}
          packageBusy={packageImport.busy}
        />
      )}
      {packageImport.panel}
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
          notes, {lastImport.counts.adventures} adventure folders, {lastImport.counts.encounters}{' '}
          encounters
          {lastImport.warnings.length
            ? ` · ${lastImport.warnings.length} warnings: ${lastImport.warnings.join('; ')}`
            : ''}
        </p>
      )}
      {campaigns.length === 0 ? (
        <p className="muted">No campaigns yet. Start one, or bring one in, with Create campaign.</p>
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
                    className="btn primary"
                    onClick={() => switchCampaign(c.id)}
                  >
                    {isCurrent ? 'Back to console' : 'Open'}
                  </button>
                  {isCurrent && (
                    <button
                      type="button"
                      className="btn"
                      disabled={importing}
                      title="Merge a Game Master campaign XML, or a Fight Club GM export, into this campaign"
                      onClick={() => void importXml('merge')}
                    >
                      Import Game Master XML…
                    </button>
                  )}
                  <span className="spacer" />
                  <button
                    type="button"
                    className="chrome-btn"
                    title="Export campaign…"
                    aria-label={`Export ${c.name}…`}
                    aria-expanded={exporting === c.id}
                    onClick={() => setExporting(exporting === c.id ? null : c.id)}
                  >
                    <Icon name="send" />
                  </button>
                  {deleting !== c.id && (
                    <button
                      type="button"
                      className="chrome-btn danger"
                      title="Delete campaign…"
                      aria-label={`Delete ${c.name}…`}
                      onClick={() => setDeleting(c.id)}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
                {exporting === c.id && (
                  <CampaignExportPanel campaign={c} onClose={() => setExporting(null)} />
                )}
                {deleting === c.id && (
                  <DeleteCampaignConfirm campaign={c} onCancel={() => setDeleting(null)} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">
        A campaign holds its party, NPCs, notes, encounters, scenes and playlists. Opening one
        enters the console with its tabs, dock and layouts as you left them; the Library stays a
        click away on the mark.
      </p>
    </section>
  );
}

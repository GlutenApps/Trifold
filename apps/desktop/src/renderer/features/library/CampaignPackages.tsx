import { useEffect, useState } from 'react';
import type {
  CampaignExportPreview,
  CampaignPackageInfo,
  CampaignPackageMode,
  CampaignPackageResult,
  CampaignSummary,
} from '@trifold/api';
import type { CampaignExportOptions } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { useShellStore } from '../../stores/shellStore';
import { InlineConfirm } from '../shell/InlineConfirm';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Export campaign (ADR 0015), inline in the campaign's card: the state to keep, what to include,
 * what stays behind, then the OS save dialog.
 */
export function CampaignExportPanel({
  campaign,
  onClose,
}: {
  campaign: CampaignSummary;
  onClose(): void;
}) {
  const [options, setOptions] = useState<CampaignExportOptions>({
    state: 'asIs',
    party: true,
    homebrew: true,
    layout: false,
  });
  const [preview, setPreview] = useState<CampaignExportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<CampaignExportOptions>) => setOptions((o) => ({ ...o, ...patch }));

  useEffect(() => {
    let live = true;
    void window.trifold.campaigns
      .exportPreview(campaign.id, options)
      .then((p) => live && setPreview(p))
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
    };
  }, [campaign.id, options]);

  const exportNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // The open campaign's last edits go into the file.
      await flushPendingSaves();
      const path = await window.trifold.campaigns.exportTo(campaign.id, options);
      if (path) setMessage(`Exported to ${path}`);
    } catch (err) {
      setMessage(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const id = (name: string) => `export-${campaign.id}-${name}`;
  return (
    <div
      className="campaign-panel"
      role="group"
      aria-label={`Export ${campaign.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="row" role="radiogroup" aria-label="State">
        <span className="muted small">State</span>
        <label className="field inline">
          <input
            type="radio"
            name={id('state')}
            checked={options.state === 'asIs'}
            onChange={() => set({ state: 'asIs' })}
          />
          As it is now
        </label>
        <label className="field inline">
          <input
            type="radio"
            name={id('state')}
            checked={options.state === 'fresh'}
            onChange={() => set({ state: 'fresh' })}
          />
          Fresh start
        </label>
      </div>
      <p className="muted small">
        {options.state === 'fresh'
          ? 'Keeps notes, maps, token positions, encounters and NPCs; resets HP, the dead, fights in progress and their logs.'
          : 'Everything as it stands, including a fight in progress.'}
      </p>
      <div className="row">
        <label className="field inline">
          <input
            type="checkbox"
            checked={options.party}
            onChange={(e) => set({ party: e.target.checked })}
          />
          Party ({plural(campaign.pcCount, 'PC card')})
        </label>
        <label className="field inline">
          <input
            type="checkbox"
            checked={options.homebrew}
            onChange={(e) => set({ homebrew: e.target.checked })}
          />
          Homebrew it uses ({plural(preview?.homebrew ?? 0, 'record')})
        </label>
        <label className="field inline">
          <input
            type="checkbox"
            checked={options.layout}
            onChange={(e) => set({ layout: e.target.checked })}
          />
          Console layout
        </label>
      </div>
      {preview && preview.importedRecords > 0 && (
        <p className="muted small" data-testid="export-imported-note">
          {plural(preview.importedRecords, 'record')} from imported sources{' '}
          {preview.importedRecords === 1 ? 'is' : 'are'} not included;{' '}
          {preview.importedRecords === 1 ? 'it appears' : 'they appear'} if the other Library has
          the same sources. Scene music is never included.
        </p>
      )}
      {message && <p className="muted small">{message}</p>}
      <div className="row">
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void exportNow()}
        >
          {busy ? 'Exporting…' : 'Export…'}
        </button>
      </div>
    </div>
  );
}

function resultText(r: CampaignPackageResult): string {
  const parts = [
    `${r.mode === 'replace' ? 'Replaced' : 'Imported'} ${r.campaign.name}`,
    r.homebrewAdded ? `${plural(r.homebrewAdded, 'homebrew record')} added` : null,
    r.homebrewKept
      ? `${plural(r.homebrewKept, 'homebrew record')} already here kept as they were`
      : null,
    r.unresolved ? `${plural(r.unresolved, 'record')} this Library does not have` : null,
    r.safety ? `a backup was written first (${r.safety})` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Import campaign (ADR 0015): pick a `.trifold-campaign`, see what it is, choose how. The button
 * goes in the page's header row and the panel below it.
 */
export function useCampaignPackageImport(): { button: JSX.Element; panel: JSX.Element | null } {
  const [picked, setPicked] = useState<CampaignPackageInfo | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pick = async () => {
    setMessage(null);
    setConfirmReplace(false);
    try {
      setPicked(await window.trifold.campaigns.choosePackage());
    } catch (err) {
      setMessage(messageOf(err));
    }
  };

  const importAs = async (file: CampaignPackageInfo, mode: CampaignPackageMode) => {
    setBusy(true);
    setMessage(null);
    try {
      // Nothing waiting to save may land on top of a replaced campaign.
      await flushPendingSaves();
      const result = await window.trifold.campaigns.importPackage(file.path, mode);
      setPicked(null);
      setConfirmReplace(false);
      setMessage(resultText(result));
      await useCampaignStore.getState().load();
      // The shell keeps the consoles it read at start; give it the one the file carried.
      await useAppStore.getState().load();
      const slug = result.campaign.slug;
      const layout = useAppStore.getState().library?.settings?.workspace.consoles[slug];
      if (layout) useShellStore.setState((s) => ({ consoles: { ...s.consoles, [slug]: layout } }));
    } catch (err) {
      setMessage(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const m = picked?.manifest?.campaign;
  const button = (
    <button type="button" className="btn" disabled={busy} onClick={() => void pick()}>
      Import campaign…
    </button>
  );
  const panel =
    picked || message ? (
      <div className="card campaign-panel" data-testid="campaign-package" role="status">
        {picked?.problem && (
          <div className="row">
            <span className="warn-text">
              {picked.name}: {picked.problem}
            </span>
            <span className="spacer" />
            <button type="button" className="btn small" onClick={() => setPicked(null)}>
              Dismiss
            </button>
          </div>
        )}
        {picked && !picked.problem && (
          <>
            <p>
              <strong>{m?.name ?? picked.name}</strong>
              <span className="muted small">
                {' '}
                · {plural(m?.pcs ?? 0, 'PC card')} ·{' '}
                {m?.options.state === 'fresh' ? 'fresh start' : 'as it was'}
                {picked.manifest?.counts.homebrew
                  ? ` · ${plural(picked.manifest.counts.homebrew, 'homebrew record')}`
                  : ''}
              </span>
            </p>
            {picked.existing ? (
              <>
                <p className="muted small">
                  This Library already has {picked.existing.name}. Replace it with the file&apos;s
                  version, or import a copy beside it.
                </p>
                <div className="row">
                  {confirmReplace ? (
                    <InlineConfirm
                      name={picked.existing.name}
                      verb="Replace"
                      question={`Replace ${picked.existing.name} with the file's version? A backup is written first.`}
                      onConfirm={() => void importAs(picked, 'replace')}
                      onKeep={() => setConfirmReplace(false)}
                    />
                  ) : (
                    <>
                      <span className="spacer" />
                      <button type="button" className="btn" onClick={() => setPicked(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => setConfirmReplace(true)}
                      >
                        Replace…
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={busy}
                        onClick={() => void importAs(picked, 'copy')}
                      >
                        Import as a copy
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="row">
                <span className="spacer" />
                <button type="button" className="btn" onClick={() => setPicked(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void importAs(picked, 'new')}
                >
                  Import
                </button>
              </div>
            )}
          </>
        )}
        {message && !picked && (
          <div className="row">
            <span className="muted small" data-testid="campaign-package-result">
              {message}
            </span>
            <span className="spacer" />
            <button type="button" className="btn small" onClick={() => setMessage(null)}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    ) : null;
  return { button, panel };
}

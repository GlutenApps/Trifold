import { useCallback, useEffect, useState } from 'react';
import type { SampleCampaignStatus } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { InlineConfirm } from '../shell/InlineConfirm';
import { SettingRow } from './SettingsLayout';

/**
 * Settings › Library › Sample campaign (ADR 0016). Every Library is given the sample once; this row is
 * how a DM who deleted it gets it back, or puts a played-through copy back as it ships.
 */
export function SampleCampaignRow() {
  const library = useAppStore((s) => s.library);
  const reloadCampaign = useCampaignStore((s) => s.load);
  const hasLibrary = library?.ok === true;
  const [status, setStatus] = useState<SampleCampaignStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.trifold.campaigns.sample());
    } catch (err) {
      setStatus(null);
      setMessage({ text: err instanceof Error ? err.message : String(err), warn: true });
    }
  }, []);

  useEffect(() => {
    if (hasLibrary) void refresh();
  }, [hasLibrary, library?.path, refresh]);

  const add = async () => {
    setConfirm(false);
    setBusy(true);
    setMessage(null);
    try {
      await flushPendingSaves();
      const result = await window.trifold.campaigns.addSample();
      setMessage({
        text:
          result.mode === 'replace'
            ? `${result.campaign.name} is back as it ships. A backup of the Library was saved first.`
            : `Added ${result.campaign.name}. Open it from Campaigns.`,
        warn: false,
      });
      await reloadCampaign();
      await refresh();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), warn: true });
    } finally {
      setBusy(false);
    }
  };

  const name = status?.name ?? 'The sample campaign';

  return (
    <SettingRow
      label="Sample campaign"
      hint="A short adventure that shows every part of Trifold."
      status={
        <>
          <p className="small" data-testid="sample-campaign-status">
            {status && !status.available
              ? 'This build of Trifold has no sample campaign.'
              : status === null
                ? '…'
                : status.present
                  ? `${name} is in this Library.`
                  : `${name} is not in this Library.`}
          </p>
          {message && (
            <p className={message.warn ? 'warn-text small' : 'muted small'} role="status">
              {message.text}
            </p>
          )}
        </>
      }
    >
      {status && !status.available ? null : confirm ? (
        <InlineConfirm
          name={name}
          verb="Reset"
          question={`Put ${name} back as it ships? Changes to it are lost; a backup is saved first.`}
          onConfirm={() => void add()}
          onKeep={() => setConfirm(false)}
        />
      ) : status?.present ? (
        <button
          type="button"
          className="btn"
          disabled={!hasLibrary || busy}
          onClick={() => setConfirm(true)}
        >
          Reset the sample campaign
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          disabled={!hasLibrary || busy || status === null}
          onClick={() => void add()}
        >
          {busy ? 'Adding…' : 'Add the sample campaign'}
        </button>
      )}
    </SettingRow>
  );
}

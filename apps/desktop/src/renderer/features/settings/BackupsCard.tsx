import { useCallback, useEffect, useState } from 'react';
import type { BackupInfo } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_LABEL: Record<BackupInfo['kind'], string> = {
  daily: 'daily',
  manual: 'manual',
  preRestore: 'before restore',
};

/** Backups card (DESIGN.md §4.2 and §10 M1 §8): schedule, back up now, restore. */
export function BackupsCard() {
  const library = useAppStore((s) => s.library);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshLibrary = useAppStore((s) => s.load);
  const reloadCampaign = useCampaignStore((s) => s.load);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const settings = library?.settings?.backups ?? null;
  const hasLibrary = library?.ok === true;

  const refresh = useCallback(async () => {
    try {
      setBackups(await window.trifold.backups.list());
    } catch {
      setBackups([]);
    }
  }, []);

  useEffect(() => {
    if (hasLibrary) void refresh();
  }, [hasLibrary, library?.path, refresh]);

  const backUpNow = async () => {
    setBusy('create');
    setMessage(null);
    try {
      const info = await window.trifold.backups.create();
      setMessage(info ? `Wrote ${info.name}` : 'A backup is already running');
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (name: string) => {
    setBusy(name);
    setConfirm(null);
    setMessage(null);
    try {
      const info = await window.trifold.backups.restore(name);
      setMessage(
        info.ok
          ? `Restored ${name}. A copy of the previous state was saved first.`
          : `Restored, but the Library could not be reopened: ${info.error ?? 'unknown'}`,
      );
      await refreshLibrary();
      await reloadCampaign();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" data-testid="backups-card">
      <h2>Backups</h2>
      <p className="muted">
        A zip of the Library (everything except the search index, logs and music files) is written
        once a day while Trifold is open, into the Library&apos;s backups folder.
      </p>
      <div className="row">
        <label className="field inline">
          <input
            type="checkbox"
            disabled={!hasLibrary}
            checked={settings?.enabled ?? true}
            onChange={(e) =>
              void updateSettings({ backups: { ...(settings ?? { keepDays: 14 }), enabled: e.target.checked } })
            }
          />
          Daily backup
        </label>
        <label className="field inline">
          Keep
          <input
            type="number"
            className="narrow"
            min={1}
            max={365}
            disabled={!hasLibrary}
            value={settings?.keepDays ?? 14}
            onChange={(e) =>
              void updateSettings({
                backups: {
                  ...(settings ?? { enabled: true }),
                  keepDays: Math.min(365, Math.max(1, Number(e.target.value) || 14)),
                },
              })
            }
          />
          days
        </label>
        <span className="spacer" />
        <button type="button" className="btn primary" disabled={!hasLibrary || busy !== null} onClick={() => void backUpNow()}>
          {busy === 'create' ? 'Backing up…' : 'Back up now'}
        </button>
        <button type="button" className="btn" disabled={!hasLibrary} onClick={() => void window.trifold.backups.openFolder()}>
          Open backups folder
        </button>
      </div>
      {message && <p className="muted small">{message}</p>}
      {backups.length > 0 && (
        <table className="track-table">
          <thead>
            <tr>
              <th>Backup</th>
              <th>Kind</th>
              <th>Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.name} data-testid="backup-row">
                <td>{b.name}</td>
                <td className="muted small">{KIND_LABEL[b.kind]}</td>
                <td className="muted small">{size(b.sizeBytes)}</td>
                <td>
                  {confirm === b.name ? (
                    <span className="row">
                      <span className="small">Overwrite the Library with this backup?</span>
                      <button type="button" className="btn tiny danger" onClick={() => void restore(b.name)}>
                        Restore
                      </button>
                      <button type="button" className="btn tiny" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn tiny" disabled={busy !== null} onClick={() => setConfirm(b.name)}>
                      Restore…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

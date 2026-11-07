import { InlineConfirm } from '../shell/InlineConfirm';
import { useCallback, useEffect, useState } from 'react';
import type { BackupCopyStatus, BackupFileInfo, BackupInfo } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { flushPendingSaves } from '../../stores/pendingSaves';
import { Icon } from '../shell/icons';

/**
 * The Backups card on Library › Settings (DESIGN.md §4.2 and §10 M1 item 8, ADR 0015): the
 * daily backup switch and keep days, Back up now, the second copy location, the zips in the
 * Library and restore from one of them or from any file. Pending saves are flushed before a
 * backup or restore so the zip holds the last edit. `BackupsCard` below is the card; the
 * helpers above it format sizes, dates and a picked zip's manifest.
 */
function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_LABEL: Record<BackupInfo['kind'], string> = {
  daily: 'daily',
  manual: 'manual',
  quit: 'on close',
  preRestore: 'before restore',
};

/** A copy older than this is called out on the card (ADR 0015). */
const STALE_COPY_MS = 3 * 86_400_000;

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** What a picked zip holds, from its manifest, for the restore confirmation. */
function contents(file: BackupFileInfo): string {
  const m = file.manifest;
  if (!m) return file.name;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${file.name}: ${plural(m.counts.campaigns, 'campaign')}, ${plural(
    m.counts.homebrew,
    'homebrew record',
  )}, ${plural(m.counts.sources, 'imported source')}${m.createdAt ? `, made ${when(m.createdAt)}` : ''}`;
}

function CopyStatusLine({ status }: { status: BackupCopyStatus }) {
  if (status.lastError) {
    return (
      <p className="warn-text small" data-testid="backup-copy-status">
        The last copy failed: {status.lastError}
      </p>
    );
  }
  if (!status.lastCopyAt) {
    return (
      <p className="muted small" data-testid="backup-copy-status">
        Nothing copied yet. The next backup will be.
      </p>
    );
  }
  const stale = Date.now() - Date.parse(status.lastCopyAt) > STALE_COPY_MS;
  return (
    <p className={stale ? 'warn-text small' : 'muted small'} data-testid="backup-copy-status">
      Last copied {when(status.lastCopyAt)}
      {stale ? '. That is more than 3 days ago.' : ''}
    </p>
  );
}

/**
 * Backups card (DESIGN.md §4.2 and §10 M1 item 8, ADR 0015): schedule, second location, back up,
 * restore.
 */
export function BackupsCard() {
  const library = useAppStore((s) => s.library);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshLibrary = useAppStore((s) => s.load);
  const reloadCampaign = useCampaignStore((s) => s.load);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [copy, setCopy] = useState<BackupCopyStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [picked, setPicked] = useState<BackupFileInfo | null>(null);
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

  useEffect(() => {
    void window.trifold.backups
      .copyStatus()
      .then(setCopy)
      .catch(() => setCopy(null));
    return window.trifold.on('backupCopy', setCopy);
  }, [library?.path]);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await work();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const backUpNow = () =>
    run('create', async () => {
      await flushPendingSaves();
      const info = await window.trifold.backups.create();
      setMessage(info ? `Wrote ${info.name}` : 'A backup is already running');
      await refresh();
    });

  const afterRestore = async (label: string, ok: boolean, error: string | null) => {
    setMessage(
      ok
        ? `Restored ${label}. A copy of the previous state was saved first.`
        : `Restored, but the Library could not be reopened: ${error ?? 'unknown'}`,
    );
    await refreshLibrary();
    await reloadCampaign();
    await refresh();
  };

  const restore = (name: string) =>
    run(name, async () => {
      setConfirm(null);
      await flushPendingSaves();
      const info = await window.trifold.backups.restore(name);
      await afterRestore(name, info.ok, info.error);
    });

  const pickFile = () =>
    run('pick', async () => {
      setPicked(await window.trifold.backups.chooseFile());
    });

  const restoreFile = (file: BackupFileInfo) =>
    run('file', async () => {
      setPicked(null);
      await flushPendingSaves();
      const info = await window.trifold.backups.restoreFile(file.path);
      await afterRestore(file.name, info.ok, info.error);
    });

  const chooseCopyFolder = () =>
    run('copy', async () => {
      setCopy(await window.trifold.backups.chooseCopyFolder());
    });

  const stopCopying = () =>
    run('copy', async () => {
      setCopy(await window.trifold.backups.stopCopying());
    });

  return (
    <div className="card span" data-testid="backups-card">
      <h2>Backups</h2>
      <p className="muted">
        A zip of the Library (everything except the search index, logs and music files) is written
        once a day while Trifold is open, and again when it closes if anything changed, into the
        Library&apos;s backups folder.
      </p>
      <div className="row">
        <label className="field inline">
          <input
            type="checkbox"
            disabled={!hasLibrary}
            checked={settings?.enabled ?? true}
            onChange={(e) =>
              void updateSettings({
                backups: { ...(settings ?? { keepDays: 14 }), enabled: e.target.checked },
              })
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
        <button
          type="button"
          className="btn primary"
          disabled={!hasLibrary || busy !== null}
          onClick={() => void backUpNow()}
        >
          {busy === 'create' ? 'Backing up…' : 'Back up now'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasLibrary}
          onClick={() => void window.trifold.backups.openFolder()}
        >
          Open backups folder
        </button>
      </div>

      <h3>Also copy to</h3>
      {copy?.folder ? (
        <>
          <p>
            <code className="backup-copy-target" data-testid="backup-copy-target">
              {copy.target ?? copy.folder}
            </code>
          </p>
          <CopyStatusLine status={copy} />
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={!hasLibrary || busy !== null}
              onClick={() => void chooseCopyFolder()}
            >
              Change folder…
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void stopCopying()}
            >
              Stop copying
            </button>
          </div>
        </>
      ) : (
        <div className="row">
          <p className="muted">
            Keep a copy off this computer: choose a folder on another drive, or one your cloud sync
            app keeps. Every backup is copied there too.
          </p>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            disabled={!hasLibrary || busy !== null}
            onClick={() => void chooseCopyFolder()}
          >
            Choose folder…
          </button>
        </div>
      )}

      <h3>Restore</h3>
      <div className="row">
        <p className="muted">
          Restoring replaces the Library with the backup. A zip of the current state is saved first.
          On a new computer, restore the newest zip from your copy folder.
        </p>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          disabled={!hasLibrary || busy !== null}
          onClick={() => void pickFile()}
        >
          Restore from file…
        </button>
      </div>
      {picked && (
        <div className="row" data-testid="backup-file-picked">
          {picked.problem ? (
            <>
              <span className="warn-text">
                {picked.name}: {picked.problem}
              </span>
              <span className="spacer" />
              <button type="button" className="btn small" onClick={() => setPicked(null)}>
                Dismiss
              </button>
            </>
          ) : (
            <InlineConfirm
              name={picked.name}
              verb="Restore"
              question={`Replace the Library with ${contents(picked)}?`}
              onConfirm={() => void restoreFile(picked)}
              onKeep={() => setPicked(null)}
            />
          )}
        </div>
      )}

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
              <tr key={b.name} className="backup-row" data-testid="backup-row">
                <td>{b.name}</td>
                <td className="muted small">{KIND_LABEL[b.kind]}</td>
                <td className="muted small">{size(b.sizeBytes)}</td>
                <td>
                  {confirm === b.name ? (
                    <InlineConfirm
                      name={b.name}
                      verb="Restore"
                      question="Replace the Library with this backup?"
                      onConfirm={() => void restore(b.name)}
                      onKeep={() => setConfirm(null)}
                    />
                  ) : (
                    <span className="row-actions">
                      <button
                        type="button"
                        className="chrome-btn xs"
                        title="Restore this backup"
                        aria-label={`Restore ${b.name}`}
                        disabled={busy !== null}
                        onClick={() => setConfirm(b.name)}
                      >
                        <Icon name="undo" />
                      </button>
                    </span>
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

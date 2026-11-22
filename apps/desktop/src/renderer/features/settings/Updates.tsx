import { useEffect } from 'react';
import type { UpdateStatus } from '@trifold/api';
import { landOn } from '../../navigate';
import { useShellStore } from '../../stores/shellStore';
import { useUpdateStore } from '../../stores/updateStore';
import { Icon } from '../shell/icons';
import { SettingRow, SettingsSection } from './SettingsLayout';

/**
 * The update check's screens (ADR 0034, ADR 0045, DESIGN.md §10 Beta 2): the Settings section, the
 * top bar's button when a newer version is out or ready to install, and the Library's one-time
 * question. Main does the checking and downloading; nothing here touches the network. No copy
 * names the release host (CLAUDE.md ground rule 1): it is "the public release list".
 *
 * The installed Windows build (`mode: 'install'`) downloads in the background and installs only
 * when the DM presses Restart now in Settings; the top bar only points there, so a stray click
 * never closes the app mid-session. Other builds open the release page.
 */

/** Where the top bar's button lands: the Updates section in Settings. */
export const UPDATES_NAV_KEY = 'settings:updates';

/** Reads the status once and follows main's `updateStatus` events. Mounted by the app shell. */
export function useUpdateEvents(): void {
  useEffect(() => {
    void useUpdateStore.getState().load();
    return window.trifold.on('updateStatus', (status) => useUpdateStore.getState().receive(status));
  }, []);
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** What the check sends and what happens next, for Settings and the one-time question. */
function whatItDoes(mode: UpdateStatus['mode']): string {
  return mode === 'install'
    ? 'It sends only its own version number, never your games. A new version downloads in the background and installs only when you choose Restart now.'
    : 'It sends only its own version number, never your games, and nothing is downloaded or installed for you.';
}

/** The status line's words after "You have Trifold x." */
function statusText(status: UpdateStatus): string {
  const { available, download } = status;
  if (status.checking) return 'Checking…';
  if (available && status.mode === 'install') {
    switch (download.state) {
      case 'downloading':
        return `Downloading Trifold ${available.version}… ${download.percent}%`;
      case 'ready':
        return `Trifold ${available.version} is ready to install.`;
      case 'failed':
        return `Trifold ${available.version} is out, but the download did not work: ${download.error ?? 'unknown error'}. Trifold will try again.`;
      default:
        return `Trifold ${available.version} is out.`;
    }
  }
  if (available) return `Trifold ${available.version} is out.`;
  if (status.lastCheckAt) return `It is the newest version (checked ${when(status.lastCheckAt)}).`;
  return 'Not checked yet.';
}

export function UpdatesSection() {
  const status = useUpdateStore((s) => s.status);
  const error = useUpdateStore((s) => s.error);
  const setEnabled = useUpdateStore((s) => s.setEnabled);
  const checkNow = useUpdateStore((s) => s.checkNow);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const openDownload = useUpdateStore((s) => s.openDownload);
  const restartToUpdate = useUpdateStore((s) => s.restartToUpdate);
  if (!status) return null;
  const { available, download } = status;
  const installs = status.mode === 'install';
  const ready = installs && download.state === 'ready';

  return (
    <SettingsSection id="updates" icon="refresh" title="Updates" nav={UPDATES_NAV_KEY}>
      <SettingRow
        label="Check for new versions"
        htmlFor="updates-enabled"
        hint="At start and once a day. It sends only its version number, never your games."
      >
        <input
          id="updates-enabled"
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => void setEnabled(e.target.checked)}
        />
      </SettingRow>
      <SettingRow
        label="Version"
        status={
          <>
            <p className="small" data-testid="update-status">
              You have Trifold {status.current}. {statusText(status)}
            </p>
            {installs && download.state === 'downloading' && (
              <progress
                className="update-progress"
                max={100}
                value={download.percent}
                aria-label={`Downloading Trifold ${available?.version ?? ''}`}
              />
            )}
            {ready && (
              <p className="muted small">
                Restarting saves your work and makes the on-close backup, then installs the update
                and opens Trifold again.
              </p>
            )}
            {status.lastError && !status.checking && (
              <p className="muted small" role="status">
                The last check did not work: {status.lastError}.
              </p>
            )}
            {error && (
              <p className="muted small" role="alert">
                {error}
              </p>
            )}
          </>
        }
      >
        {ready && (
          <button
            type="button"
            className="btn primary"
            title="Closes Trifold, installs the update and opens it again"
            onClick={() => void restartToUpdate()}
          >
            <Icon name="refresh" />
            Restart now
          </button>
        )}
        {available && (!installs || download.state === 'failed') && (
          <button
            type="button"
            className={installs ? 'btn' : 'btn primary'}
            title="Opens the release page in your browser"
            onClick={() => void openDownload()}
          >
            <Icon name="external" />
            Download {available.version}
          </button>
        )}
        {available && !status.dismissed && (
          <button
            type="button"
            className="btn"
            title="Hide the top bar's button until a newer version is out"
            onClick={() => void dismiss()}
          >
            Not now
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={status.checking}
          onClick={() => void checkNow()}
        >
          Check now
        </button>
      </SettingRow>
    </SettingsSection>
  );
}

/**
 * The top bar's quiet notice: shown while a newer version is out and not dismissed. Once the
 * installer is downloaded it reads Restart to update; either way it opens Settings › Updates.
 */
export function UpdateTopBarButton() {
  const status = useUpdateStore((s) => s.status);
  const enterLibrary = useShellStore((s) => s.enterLibrary);
  const available = status?.available;
  if (!available || status.dismissed) return null;
  const ready = status.mode === 'install' && status.download.state === 'ready';
  const name = ready
    ? `Trifold ${available.version} is ready: restart to update`
    : `Trifold ${available.version} is available`;
  return (
    <button
      type="button"
      className="btn ghost update-available"
      aria-label={name}
      title={`${name}. See Settings › Updates`}
      onClick={() => {
        enterLibrary('settings');
        landOn(UPDATES_NAV_KEY);
      }}
    >
      <Icon name={ready ? 'refresh' : 'bell'} />
      <span className="topbar-label">{ready ? 'Restart to update' : 'Update available'}</span>
    </button>
  );
}

/** The Library's one-time question; either answer hides it for good. */
export function UpdatePrompt() {
  const status = useUpdateStore((s) => s.status);
  const setEnabled = useUpdateStore((s) => s.setEnabled);
  if (!status || status.asked) return null;
  return (
    <div className="banner warn wraps update-prompt" role="region" aria-label="Check for updates">
      <span>
        <strong>Check for new versions of Trifold?</strong> When it starts, it can ask its public
        release list whether a newer version is out. {whatItDoes(status.mode)} You can change this
        in Settings.
      </span>
      <span className="row">
        <button type="button" className="btn primary small" onClick={() => void setEnabled(true)}>
          Turn on
        </button>
        <button type="button" className="btn small" onClick={() => void setEnabled(false)}>
          No thanks
        </button>
      </span>
    </div>
  );
}

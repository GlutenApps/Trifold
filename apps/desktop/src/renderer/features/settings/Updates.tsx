import { useEffect } from 'react';
import { landOn } from '../../navigate';
import { useShellStore } from '../../stores/shellStore';
import { useUpdateStore } from '../../stores/updateStore';
import { Icon } from '../shell/icons';

/**
 * The update check's screens (ADR 0034, DESIGN.md §10 Beta 2): the Settings card, the top bar's
 * button when a newer version is out, and the Library's one-time question. Main does the
 * checking; nothing here touches the network. No copy names the release host (CLAUDE.md ground
 * rule 1): it is "the public release list".
 */

/** Where the top bar's button lands: the Updates card in Settings. */
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

export function UpdatesCard() {
  const status = useUpdateStore((s) => s.status);
  const error = useUpdateStore((s) => s.error);
  const setEnabled = useUpdateStore((s) => s.setEnabled);
  const checkNow = useUpdateStore((s) => s.checkNow);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const openDownload = useUpdateStore((s) => s.openDownload);
  if (!status) return null;
  const { available } = status;

  return (
    <div className="card updates-card" data-nav={UPDATES_NAV_KEY} aria-label="Updates">
      <h2>Updates</h2>
      <label className="row">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => void setEnabled(e.target.checked)}
        />
        Check for new versions once a day
      </label>
      <p className="muted small">
        Trifold asks its public release list whether a newer version is out. It sends only its own
        version number, never your games, and nothing is downloaded or installed for you.
      </p>
      <p data-testid="update-status">
        You have Trifold {status.current}.{' '}
        {status.checking
          ? 'Checking…'
          : available
            ? `Trifold ${available.version} is out.`
            : status.lastCheckAt
              ? `It is the newest version (checked ${when(status.lastCheckAt)}).`
              : 'Not checked yet.'}
      </p>
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
      <div className="row">
        {available && (
          <button
            type="button"
            className="btn primary"
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
      </div>
    </div>
  );
}

/** The top bar's quiet notice: shown while a newer version is out and not dismissed. */
export function UpdateTopBarButton() {
  const status = useUpdateStore((s) => s.status);
  const enterLibrary = useShellStore((s) => s.enterLibrary);
  const available = status?.available;
  if (!available || status.dismissed) return null;
  return (
    <button
      type="button"
      className="btn ghost update-available"
      aria-label={`Trifold ${available.version} is available`}
      title={`Trifold ${available.version} is available: see Settings › Updates`}
      onClick={() => {
        enterLibrary('settings');
        landOn(UPDATES_NAV_KEY);
      }}
    >
      <Icon name="bell" />
      <span className="topbar-label">Update available</span>
    </button>
  );
}

/** The Library's one-time question; either answer hides it for good. */
export function UpdatePrompt() {
  const status = useUpdateStore((s) => s.status);
  const setEnabled = useUpdateStore((s) => s.setEnabled);
  if (!status || status.asked) return null;
  return (
    <div className="banner update-prompt" role="region" aria-label="Check for updates">
      <span>
        <strong>Check for new versions of Trifold?</strong> Once a day it can ask its public release
        list whether a newer version is out. It sends only its own version number, never your games,
        and you can change this in Settings.
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

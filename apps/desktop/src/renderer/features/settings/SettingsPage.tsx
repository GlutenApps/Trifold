import { useCallback, useEffect, useState } from 'react';
import type { AttributionEntry, IconCreditsInfo, RecentLibrary } from '@trifold/api';
import { errorMessage, type TextSize } from '@trifold/schema';
import { useAppStore } from '../../stores/appStore';
import { BrandLockup } from '../shell/Brand';
import { Icon } from '../shell/icons';
import { BackupsSection } from './BackupsSection';
import { SampleCampaignRow } from './SampleCampaignRow';
import { SettingRow, SettingsSection } from './SettingsLayout';
import { UpdatesSection } from './Updates';
// The app's own licence (ADR 0056); the GPL asks an interactive program to show it.
import gplText from '../../../../../../LICENSE?raw';

/**
 * Library › Settings (ADR 0054): one column of sections in the order a DM needs them. Table
 * display, Appearance, Backups, Updates, Library, Troubleshooting, About. About carries the SRD
 * and game-icons attribution the content policy requires (DESIGN.md §6.1 and §8); the statements
 * and license texts come from main, never from this file. Sources live under Library ›
 * Compendium, music under the Music tool and the table server under the VTT tab, where they are
 * used; Rebuild index is here as a repair (ADR 0026), since the index keeps itself in step.
 */

const TEXT_SIZES: Array<{ value: TextSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Extra large' },
];

/** Settings › Table display: the screen the TV opens on. */
function DisplaySection({ hasLibrary }: { hasLibrary: boolean }) {
  const library = useAppStore((s) => s.library);
  const displays = useAppStore((s) => s.displays);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshDisplays = useAppStore((s) => s.refreshDisplays);
  const chosen = library?.settings?.playerDisplayId ?? null;
  const ordered = [...displays].sort((a, b) => a.number - b.number);

  return (
    <SettingsSection id="display" icon="tv" title="Table display">
      <SettingRow label="TV screen" hint="Where the TV opens when you go live.">
        <div className="settings-choices" role="radiogroup" aria-label="TV screen">
          {ordered.map((d) => (
            <label key={d.id}>
              <input
                type="radio"
                name="playerDisplay"
                disabled={!hasLibrary}
                checked={chosen === d.id}
                onChange={() => void updateSettings({ playerDisplayId: d.id })}
              />
              <span>
                {d.label}
                <span className="muted small">
                  {' '}
                  · {d.bounds.width}×{d.bounds.height}
                  {d.isPrimary ? ' · primary' : ''}
                </span>
              </span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="playerDisplay"
              disabled={!hasLibrary}
              checked={chosen === null}
              onChange={() => void updateSettings({ playerDisplayId: null })}
            />
            <span>
              Automatic
              <span className="muted small"> · a screen that is not the primary</span>
            </span>
          </label>
          <p className="muted small">With one screen, only players&apos; phones show the table.</p>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => void window.trifold.displays.identify()}
            >
              Identify
            </button>
            <button type="button" className="btn" onClick={() => void refreshDisplays()}>
              Refresh displays
            </button>
          </div>
        </div>
      </SettingRow>
    </SettingsSection>
  );
}

/** Settings › Appearance: the Library's theme and this computer's text size. */
function AppearanceSection({ hasLibrary }: { hasLibrary: boolean }) {
  const library = useAppStore((s) => s.library);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [textSize, setTextSize] = useState<TextSize | null>(null);

  useEffect(() => {
    void window.trifold.app
      .textSize()
      .then(setTextSize)
      .catch(() => setTextSize('default'));
  }, []);

  const changeTextSize = async (size: TextSize) => {
    setTextSize(size);
    try {
      setTextSize(await window.trifold.app.setTextSize(size));
    } catch {
      setTextSize(await window.trifold.app.textSize().catch(() => 'default' as const));
    }
  };

  return (
    <SettingsSection id="appearance" icon="eye" title="Appearance">
      <SettingRow label="Theme" htmlFor="settings-theme" hint="Saved with this Library.">
        <select
          id="settings-theme"
          disabled={!hasLibrary}
          value={library?.settings?.theme ?? 'dark'}
          onChange={(e) =>
            void updateSettings({ theme: e.target.value === 'light' ? 'light' : 'dark' })
          }
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </SettingRow>
      <SettingRow
        label="Text size"
        htmlFor="settings-text-size"
        hint="Zooms this window on this computer; the TV is not affected."
      >
        <select
          id="settings-text-size"
          disabled={textSize === null}
          value={textSize ?? 'default'}
          onChange={(e) => void changeTextSize(e.target.value as TextSize)}
        >
          {TEXT_SIZES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </SettingRow>
    </SettingsSection>
  );
}

/** Settings › Library: the open Library, the others opened on this computer, the sample. */
function LibrarySection({ hasLibrary }: { hasLibrary: boolean }) {
  const library = useAppStore((s) => s.library);
  const chooseLibrary = useAppStore((s) => s.chooseLibrary);
  const openLibrary = useAppStore((s) => s.openLibrary);
  const openLibraryFolder = useAppStore((s) => s.openLibraryFolder);
  const [recent, setRecent] = useState<RecentLibrary[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRecent(await window.trifold.library.recent());
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [library?.path, refresh]);

  const forget = async (path: string) => {
    try {
      setRecent(await window.trifold.library.forgetRecent(path));
    } catch {
      await refresh();
    }
  };

  return (
    <SettingsSection id="library" icon="library" title="Library">
      <SettingRow
        label="Library folder"
        hint="Where everything Trifold keeps is stored."
        status={
          <p className="small">
            <code className="settings-path">{library?.path ?? '…'}</code>
          </p>
        }
      >
        <button
          type="button"
          className="btn"
          disabled={!hasLibrary}
          onClick={() => void openLibraryFolder()}
        >
          Open folder
        </button>
        <button type="button" className="btn" onClick={() => void chooseLibrary()}>
          Open another Library…
        </button>
      </SettingRow>
      {recent.length > 0 && (
        <SettingRow
          label="Recent Libraries"
          hint="Other Libraries opened on this computer."
          below={
            <ul className="settings-list" aria-label="Recent Libraries">
              {recent.map((r) => (
                <li key={r.path} className="settings-list-row">
                  <code className="settings-path grow">{r.path}</code>
                  {!r.exists && <span className="muted small">Folder not found</span>}
                  <span className="row-actions">
                    <button
                      type="button"
                      className="chrome-btn xs"
                      title={r.exists ? 'Open this Library' : 'The folder is not there any more'}
                      aria-label={`Open ${r.path}`}
                      disabled={!r.exists}
                      onClick={() => void openLibrary(r.path)}
                    >
                      <Icon name="folder" />
                    </button>
                    <button
                      type="button"
                      className="chrome-btn xs"
                      title="Remove from this list (the folder is kept)"
                      aria-label={`Remove ${r.path} from recent Libraries`}
                      onClick={() => void forget(r.path)}
                    >
                      <Icon name="close" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          }
        />
      )}
      <SampleCampaignRow />
    </SettingsSection>
  );
}

/** Rebuild index: throws the search index away and builds it again from the source files. */
function RebuildIndex({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const stats = await window.trifold.sources.rebuildIndex();
      setMessage(
        `Rebuilt: ${stats.records} records from ${stats.sources} sources in ${(stats.tookMs / 1000).toFixed(1)} s.`,
      );
    } catch (err) {
      setMessage(`Could not rebuild the index: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };
  const library = useAppStore((s) => s.library);
  return (
    <SettingRow
      label="Search index"
      hint="Rebuild it only if search misses a record you know is there."
      status={
        <>
          <p className="small" data-testid="index-status">
            {library?.index.ok
              ? 'Index: ok'
              : `Index: unavailable (${library?.index.error ?? 'not open'})`}
          </p>
          {message && (
            <p className="muted small" role="status" data-testid="rebuild-status">
              {message}
            </p>
          )}
        </>
      }
    >
      <button type="button" className="btn" disabled={disabled || busy} onClick={() => void run()}>
        {busy ? 'Rebuilding…' : 'Rebuild index'}
      </button>
    </SettingRow>
  );
}

/** Settings › Troubleshooting: repairs and what a bug report needs. */
function TroubleshootingSection() {
  const library = useAppStore((s) => s.library);
  const [error, setError] = useState<string | null>(null);
  return (
    <SettingsSection id="troubleshooting" icon="help" title="Troubleshooting">
      <RebuildIndex disabled={!library?.index.ok} />
      <SettingRow
        label="Logs"
        hint="One file a day; attach the newest to a bug report."
        status={
          error ? (
            <p className="warn-text small" role="status">
              Could not open the logs folder: {error}
            </p>
          ) : null
        }
      >
        <button
          type="button"
          className="btn"
          onClick={() => {
            setError(null);
            void window.trifold.app.openLogsFolder().catch((err) => setError(errorMessage(err)));
          }}
        >
          Open logs folder
        </button>
      </SettingRow>
    </SettingsSection>
  );
}

/** The bundled libraries' licences (ADR 0056), read only when the DM opens them. */
function ThirdPartyNotices() {
  const [text, setText] = useState<string | null | undefined>(undefined);
  return (
    <div className="attribution" data-testid="third-party-notices">
      <details
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open && text === undefined) {
            void window.trifold.app
              .thirdPartyNotices()
              .then(setText)
              .catch(() => setText(null));
          }
        }}
      >
        <summary>Open-source libraries Trifold uses</summary>
        {text === undefined ? (
          <p className="muted small">Loading…</p>
        ) : text === null ? (
          <p className="muted small">
            This build has no notices file; an installed Trifold carries it in its licenses folder.
          </p>
        ) : (
          <pre className="source-text">{text}</pre>
        )}
      </details>
    </div>
  );
}

/** Settings › About: the version and every credit and licence the content policy requires. */
function AboutSection() {
  const info = useAppStore((s) => s.info);
  const library = useAppStore((s) => s.library);
  const [attribution, setAttribution] = useState<AttributionEntry[]>([]);
  const [iconCredits, setIconCredits] = useState<IconCreditsInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void window.trifold.sources
      .attribution()
      .then(setAttribution)
      .catch(() => setAttribution([]));
  }, [library?.path]);

  useEffect(() => {
    void window.trifold.icons
      .credits()
      .then(setIconCredits)
      .catch(() => setIconCredits(null));
  }, []);

  const versionLine = `Trifold ${info?.version ?? ''} · Electron ${info?.electron ?? ''} · Chromium ${info?.chrome ?? ''} · Node ${info?.node ?? ''}`;
  const copyVersion = async () => {
    try {
      await navigator.clipboard.writeText(`${versionLine} · ${info?.platform ?? ''}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SettingsSection id="about" icon="star" title="About">
      <div className="about-lockup">
        <BrandLockup layout="horizontal" height={40} />
      </div>
      <SettingRow
        label="Version"
        status={
          <>
            <p className="small">{versionLine}</p>
            {copied && (
              <p className="muted small" role="status">
                Copied.
              </p>
            )}
          </>
        }
      >
        <button type="button" className="btn" onClick={() => void copyVersion()}>
          Copy version info
        </button>
      </SettingRow>
      <p className="muted small">
        Trifold is 5e-compatible. It ships only System Reference Document content, game-icons.net
        icons and a sample campaign (credited below). Everything you import stays in your Library
        and is never transmitted.
      </p>
      <h3>Licence</h3>
      <div className="attribution" data-testid="app-licence">
        <p>
          Trifold {info?.version ?? ''}, copyright © 2026 Ian duPont. Trifold is free software: you
          can redistribute it and change it under the terms of the GNU General Public License,
          version 3 or (at your option) any later version. It comes with ABSOLUTELY NO WARRANTY.
          Versions 0.3.0 to 0.4.5 were released under the MIT License.
        </p>
        <details>
          <summary>GNU General Public License, version 3</summary>
          <pre className="source-text">{gplText}</pre>
        </details>
      </div>
      <h3>Credits and licences</h3>
      {attribution.length === 0 ? (
        <p className="muted">No bundled content in this build.</p>
      ) : (
        attribution.map((entry) => (
          <div key={entry.sourceId} className="attribution" data-testid="attribution">
            <p>{entry.statement}</p>
            {entry.licenses.map((l) => (
              <details key={l.key}>
                <summary>{l.name}</summary>
                <pre className="source-text">{l.text}</pre>
              </details>
            ))}
          </div>
        ))
      )}
      <div className="attribution" data-testid="icon-credits">
        {iconCredits ? (
          <>
            <p>
              Token glyphs: {iconCredits.icons} icons from game-icons.net ({iconCredits.source}),
              licensed {iconCredits.license.name} ({iconCredits.license.url}).
            </p>
            <details>
              <summary>Icon authors</summary>
              <p className="muted small">
                {iconCredits.authors.map((a) => `${a.name} (${a.icons})`).join(' · ')}
              </p>
            </details>
          </>
        ) : (
          <p className="muted">No bundled icon set in this build; tokens show initials.</p>
        )}
      </div>
      <div className="attribution" data-testid="sample-credits">
        <p>
          Sample campaign maps: Highway Town, Dwarven Tavern and Howling Tunnels by Ross McConnell,
          2-Minute Tabletop (2minutetabletop.com), licensed CC BY-NC 4.0
          (creativecommons.org/licenses/by-nc/4.0) and adapted for Trifold; not covered by
          Trifold&apos;s licence. The adventure text and the handout are Trifold&apos;s own.
        </p>
      </div>
      <ThirdPartyNotices />
      <div className="attribution" data-testid="font-credits">
        <p>
          Type: Outfit by the Outfit Project Authors and IBM Plex Mono by IBM, both under the SIL
          Open Font License 1.1 and bundled with the app.
        </p>
      </div>
    </SettingsSection>
  );
}

export function SettingsPage() {
  const library = useAppStore((s) => s.library);
  const hasLibrary = library?.ok === true;

  return (
    <div className="settings-page">
      <DisplaySection hasLibrary={hasLibrary} />
      <AppearanceSection hasLibrary={hasLibrary} />
      <BackupsSection />
      <UpdatesSection />
      <LibrarySection hasLibrary={hasLibrary} />
      <TroubleshootingSection />
      <AboutSection />
    </div>
  );
}

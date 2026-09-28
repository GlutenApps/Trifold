import { useEffect, useState } from 'react';
import type { AttributionEntry, IconCreditsInfo } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { BackupsCard } from './BackupsCard';
import { SourcesCard } from './SourcesCard';

export function SettingsPage() {
  const info = useAppStore((s) => s.info);
  const library = useAppStore((s) => s.library);
  const displays = useAppStore((s) => s.displays);
  const chooseLibrary = useAppStore((s) => s.chooseLibrary);
  const openLibraryFolder = useAppStore((s) => s.openLibraryFolder);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const refreshDisplays = useAppStore((s) => s.refreshDisplays);

  const [attribution, setAttribution] = useState<AttributionEntry[]>([]);
  useEffect(() => {
    void window.trifold.sources
      .attribution()
      .then(setAttribution)
      .catch(() => setAttribution([]));
  }, [library?.path]);

  const [iconCredits, setIconCredits] = useState<IconCreditsInfo | null>(null);
  useEffect(() => {
    void window.trifold.icons
      .credits()
      .then(setIconCredits)
      .catch(() => setIconCredits(null));
  }, []);

  const settings = library?.settings ?? null;
  const hasLibrary = library?.ok === true;
  const autoDisplay = settings?.playerDisplayId === null || settings?.playerDisplayId === undefined;

  return (
    <section>
      <h1>Settings</h1>

      <div className="card">
        <h2>Library</h2>
        <p>
          Folder: <code>{library?.path ?? '…'}</code>
        </p>
        <p data-testid="index-status">
          Index: {library?.index.ok ? 'ok' : `unavailable (${library?.index.error ?? 'not open'})`}
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void chooseLibrary()}>
            Change folder…
          </button>
          <button
            type="button"
            className="btn"
            disabled={!hasLibrary}
            onClick={() => void openLibraryFolder()}
          >
            Open folder
          </button>
        </div>
      </div>

      <SourcesCard />

      <BackupsCard />

      <div className="card">
        <h2>Displays</h2>
        <p className="muted">The player window opens full screen on the chosen display.</p>
        {displays.map((d) => (
          <label key={d.id} className="row">
            <input
              type="radio"
              name="playerDisplay"
              disabled={!hasLibrary}
              checked={settings?.playerDisplayId === d.id}
              onChange={() => void updateSettings({ playerDisplayId: d.id })}
            />
            {d.label} · {d.bounds.width}×{d.bounds.height}
            {d.isPrimary ? ' · primary' : ''}
          </label>
        ))}
        <label className="row">
          <input
            type="radio"
            name="playerDisplay"
            disabled={!hasLibrary}
            checked={autoDisplay}
            onChange={() => void updateSettings({ playerDisplayId: null })}
          />
          Automatic (first display that is not the primary)
        </label>
        <button type="button" className="btn" onClick={() => void refreshDisplays()}>
          Refresh displays
        </button>
      </div>

      <div className="card">
        <h2>Appearance</h2>
        <label className="row">
          Theme
          <select
            disabled={!hasLibrary}
            value={settings?.theme ?? 'dark'}
            onChange={(e) =>
              void updateSettings({ theme: e.target.value === 'light' ? 'light' : 'dark' })
            }
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h2>About</h2>
        <p>
          Trifold {info?.version ?? ''} · Electron {info?.electron ?? ''} · Chromium{' '}
          {info?.chrome ?? ''} · Node {info?.node ?? ''}
        </p>
        <p className="muted">
          Trifold is 5e-compatible. It ships only System Reference Document content and
          game-icons.net icons. Everything you import stays in your Library and is never
          transmitted.
        </p>
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
      </div>
    </section>
  );
}

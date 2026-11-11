import { useEffect, useState } from 'react';
import type { AttributionEntry, IconCreditsInfo } from '@trifold/api';
import { useAppStore } from '../../stores/appStore';
import { BrandLockup } from '../shell/Brand';
import { BackupsCard } from './BackupsCard';
import { SampleCampaignCard } from './SampleCampaignCard';

/**
 * Library › Settings: the Library folder, the display the TV opens on, the theme, the sample
 * campaign (ADR 0016), the Backups card and About. About carries the SRD and game-icons attribution the content policy requires
 * (DESIGN.md §6.1 and §8); the statements and license texts come from main, never from this
 * file. The Sources card lives under Library › Compendium, not here.
 */
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
    <section className="settings-page">
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

      <div className="card">
        <h2>Displays</h2>
        <p className="muted">The TV opens full screen on the chosen display.</p>
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

      <SampleCampaignCard />

      <BackupsCard />

      <div className="card span">
        <h2>About</h2>
        <div className="about-lockup">
          <BrandLockup layout="horizontal" height={40} />
        </div>
        <p>
          Trifold {info?.version ?? ''} · Electron {info?.electron ?? ''} · Chromium{' '}
          {info?.chrome ?? ''} · Node {info?.node ?? ''}
        </p>
        <p className="muted">
          Trifold is 5e-compatible. It ships only System Reference Document content, game-icons.net
          icons and a sample campaign (credited below). Everything you import stays in your Library
          and is never transmitted.
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
        <div className="attribution" data-testid="sample-credits">
          <p>
            Sample campaign maps: Highway Town, Dwarven Tavern and Howling Tunnels by Ross
            McConnell, 2-Minute Tabletop (2minutetabletop.com), licensed CC BY-NC 4.0
            (creativecommons.org/licenses/by-nc/4.0) and adapted for Trifold; not covered by
            Trifold&apos;s MIT licence. The adventure text and the handout are Trifold&apos;s own.
          </p>
        </div>
        <div className="attribution" data-testid="font-credits">
          <p>
            Type: Outfit by the Outfit Project Authors and IBM Plex Mono by IBM, both under the SIL
            Open Font License 1.1 and bundled with the app.
          </p>
        </div>
      </div>
    </section>
  );
}

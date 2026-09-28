import { useEffect } from 'react';
import { installHotkeys, registerHotkey } from '../../hotkeys';
import { useAppStore } from '../../stores/appStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { SECTIONS, useUiStore, type SectionId } from '../../stores/uiStore';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { PresenterPage } from '../presenter/PresenterPage';
import { SettingsPage } from '../settings/SettingsPage';
import { Placeholder } from './Placeholder';

function Page({ section }: { section: SectionId }) {
  switch (section) {
    case 'campaign':
      return (
        <Placeholder title="Campaign" text="Adventures, notes, NPCs and PC cards arrive in M1." />
      );
    case 'compendium':
      return <CompendiumPage />;
    case 'encounters':
      return (
        <Placeholder
          title="Encounters"
          text="Encounter builder with the 2024 budget and the combat tracker arrive in M1."
        />
      );
    case 'presenter':
      return <PresenterPage />;
    case 'music':
      return (
        <Placeholder
          title="Music"
          text="Folder scan, playlists and the crossfading player arrive in M1."
        />
      );
    case 'dice':
      return <Placeholder title="Dice" text="The roller and roll log arrive in M1." />;
    case 'settings':
      return <SettingsPage />;
  }
}

export function ConsoleShell() {
  const section = useUiStore((s) => s.section);
  const setSection = useUiStore((s) => s.setSection);
  const load = useAppStore((s) => s.load);
  const setPlayerOpen = useAppStore((s) => s.setPlayerOpen);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const playerOpen = useAppStore((s) => s.playerOpen);
  const library = useAppStore((s) => s.library);
  const scene = usePresenterStore((s) => s.state.scene);
  const blackout = usePresenterStore((s) => s.state.blackout);

  useEffect(() => {
    void load();
    return window.trifold.on('playerWindowChanged', ({ open }) => setPlayerOpen(open));
  }, [load, setPlayerOpen]);

  useEffect(() => {
    const cleanups = [
      registerHotkey({
        id: 'presenter.blackout',
        combo: 'Ctrl+Shift+B',
        description: 'Toggle blackout on the player window',
        run: () => usePresenterStore.getState().toggleBlackout(),
      }),
      registerHotkey({
        id: 'presenter.undo',
        combo: 'Ctrl+Shift+Z',
        description: 'Undo the last scene change',
        run: () => usePresenterStore.getState().undo(),
      }),
      registerHotkey({
        id: 'player.toggle',
        combo: 'Ctrl+Shift+P',
        description: 'Open or close the player window',
        run: () => {
          const app = useAppStore.getState();
          void (app.playerOpen ? app.closePlayer() : app.openPlayer());
        },
      }),
      registerHotkey({
        id: 'nav.compendium',
        combo: 'Ctrl+K',
        description: 'Jump to the compendium search',
        run: () => {
          useUiStore.getState().setSection('compendium');
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('.compendium input[type="text"]')?.focus();
          }, 0);
        },
      }),
      registerHotkey({
        id: 'nav.settings',
        combo: 'Ctrl+,',
        description: 'Open settings',
        run: () => useUiStore.getState().setSection('settings'),
      }),
      installHotkeys(),
    ];
    return () => cleanups.forEach((off) => off());
  }, []);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Sections">
        <div className="brand">Trifold</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === section ? 'page' : undefined}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}
        {library && !library.ok && (
          <div className="banner warn">
            <span>
              The Library at {library.path} could not be opened: {library.error}
            </span>
          </div>
        )}
        <Page section={section} />
      </main>

      <footer className="statusbar">
        <span>Live scene: {blackout ? 'blackout' : scene ? scene.title : 'none'}</span>
        <span>Player window: {playerOpen ? 'open' : 'closed'}</span>
        <span>Combat: none</span>
        <span>Now playing: nothing</span>
        <span className="spacer" />
        <span>
          <kbd className="kbd">Ctrl+K</kbd> search · <kbd className="kbd">Ctrl+Shift+B</kbd>{' '}
          blackout
        </span>
      </footer>
    </div>
  );
}

import { useEffect } from 'react';
import { installHotkeys, registerHotkey } from '../../hotkeys';
import { useAppStore } from '../../stores/appStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { SECTIONS, useUiStore, type SectionId } from '../../stores/uiStore';
import { useCombatStore } from '../../stores/combatStore';
import { CampaignPage } from '../campaign/CampaignPage';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { DicePage } from '../dice/DicePage';
import { EncountersPage } from '../encounters/EncountersPage';
import { PresenterPage } from '../presenter/PresenterPage';
import { SettingsPage } from '../settings/SettingsPage';
import { Placeholder } from './Placeholder';

function Page({ section }: { section: SectionId }) {
  switch (section) {
    case 'campaign':
      return <CampaignPage />;
    case 'compendium':
      return <CompendiumPage />;
    case 'encounters':
      return <EncountersPage />;
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
      return <DicePage />;
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
  const combat = useCombatStore((s) => s.state);

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
        id: 'combat.next',
        combo: 'N',
        description: 'Next turn',
        run: () => {
          const combat = useCombatStore.getState();
          if (combat.state && combat.state.turnIndex >= 0) combat.next();
        },
      }),
      registerHotkey({
        id: 'combat.previous',
        combo: 'P',
        description: 'Previous turn',
        run: () => {
          const combat = useCombatStore.getState();
          if (combat.state && combat.state.turnIndex >= 0) combat.previous();
        },
      }),
      registerHotkey({
        id: 'nav.dice',
        combo: 'Ctrl+D',
        description: 'Open the dice roller',
        run: () => useUiStore.getState().setSection('dice'),
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
        <span>
          Combat:{' '}
          {combat
            ? combat.turnIndex < 0
              ? 'setting initiative'
              : `round ${combat.round}`
            : 'none'}
        </span>
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

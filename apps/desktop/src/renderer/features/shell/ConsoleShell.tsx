import { useEffect } from 'react';
import { installHotkeys, registerHotkey } from '../../hotkeys';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useMusicStore } from '../../stores/musicStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { SECTIONS, useUiStore, type SectionId } from '../../stores/uiStore';
import { useCombatStore } from '../../stores/combatStore';
import { CampaignPage } from '../campaign/CampaignPage';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { DicePage } from '../dice/DicePage';
import { EncountersPage } from '../encounters/EncountersPage';
import { MusicPage } from '../music/MusicPage';
import { summarizeCombat } from '../presenter/combatSummary';
import { ScenesPage } from '../presenter/ScenesPage';
import { SettingsPage } from '../settings/SettingsPage';

function Page({ section }: { section: SectionId }) {
  switch (section) {
    case 'campaign':
      return <CampaignPage />;
    case 'compendium':
      return <CompendiumPage />;
    case 'encounters':
      return <EncountersPage />;
    case 'presenter':
      return <ScenesPage />;
    case 'music':
      return <MusicPage />;
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

  // Music volumes, crossfade and output device live in the Library settings.
  const musicSettings = useAppStore((s) => s.library?.settings?.music ?? null);
  useEffect(() => {
    if (musicSettings) useMusicStore.getState().applySettings(musicSettings);
  }, [musicSettings]);
  useEffect(() => {
    void useMusicStore.getState().load();
  }, []);
  const nowPlayingId = useMusicStore((s) => s.order[s.index] ?? null);
  const nowPlaying = useMusicStore((s) =>
    s.playing ? (s.library?.tracks.find((t) => t.id === nowPlayingId)?.title ?? null) : null,
  );
  const muted = useMusicStore((s) => s.muted);

  // The player camera is framed for the target display; the token treatment is a campaign setting.
  const displays = useAppStore((s) => s.displays);
  const playerDisplayId = useAppStore((s) => s.library?.settings?.playerDisplayId ?? null);
  const tokenStyle = useCampaignStore((s) => s.current?.campaign.settings.tokenStyle ?? 'engraved');
  useEffect(() => {
    const target =
      displays.find((d) => d.id === playerDisplayId) ??
      displays.find((d) => !d.isPrimary) ??
      displays[0];
    const aspect = target ? target.bounds.width / target.bounds.height : 16 / 9;
    usePresenterStore.getState().setLiveOptions({ aspect, tokenStyle });
  }, [displays, playerDisplayId, tokenStyle]);

  // Mirror the tracker to the TV: masked names, active turn, round, optional PC bars.
  useEffect(() => {
    const sync = () => {
      const combat = useCombatStore.getState().state;
      const overlays = usePresenterStore.getState().state.overlays;
      const mode =
        useCampaignStore.getState().current?.campaign.settings.hpDisplayMode ?? 'bloodied';
      usePresenterStore
        .getState()
        .setCombat(
          summarizeCombat(combat, { pcHealthBars: overlays.pcHealthBars, hpDisplayMode: mode }),
        );
    };
    const offs = [
      useCombatStore.subscribe(sync),
      usePresenterStore.subscribe((s, prev) => {
        if (s.state.overlays !== prev.state.overlays) sync();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

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
        id: 'music.playPause',
        combo: 'Ctrl+Alt+P',
        description: 'Play or pause music',
        run: () => void useMusicStore.getState().togglePlay(),
      }),
      registerHotkey({
        id: 'music.next',
        combo: 'Ctrl+Alt+ArrowRight',
        description: 'Next track',
        run: () => void useMusicStore.getState().next(),
      }),
      registerHotkey({
        id: 'music.previous',
        combo: 'Ctrl+Alt+ArrowLeft',
        description: 'Previous track',
        run: () => void useMusicStore.getState().previous(),
      }),
      registerHotkey({
        id: 'music.panic',
        combo: 'Ctrl+Alt+M',
        description: 'Panic mute all audio',
        run: () => useMusicStore.getState().toggleMuted(),
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
        <span>Now playing: {muted ? 'muted' : (nowPlaying ?? 'nothing')}</span>
        <span className="spacer" />
        <span>
          <kbd className="kbd">Ctrl+K</kbd> search · <kbd className="kbd">Ctrl+Shift+B</kbd>{' '}
          blackout
        </span>
      </footer>
    </div>
  );
}

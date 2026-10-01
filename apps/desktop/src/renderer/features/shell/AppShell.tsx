import { useEffect } from 'react';
import { installHotkeys, registerHotkey } from '../../hotkeys';
import { useAppStore } from '../../stores/appStore';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { useMusicStore } from '../../stores/musicStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useShellStore } from '../../stores/shellStore';
import { LibraryView } from '../library/LibraryView';
import { summarizeCombat } from '../presenter/combatSummary';
import { CloseCampaignPrompt } from './CloseCampaignPrompt';
import { Dock } from './Dock';
import { Flyout } from './Flyout';
import { LiveStrip } from './LiveStrip';
import { Stage } from './Stage';
import { TopBar } from './TopBar';

/**
 * The console window (ADR 0004): top bar, then the Library or the console (stage + dock), then
 * the live strip. Global wiring lives here: Library load, music settings, player framing,
 * combat mirroring, campaign lifecycle, hotkeys.
 */
export function AppShell() {
  const load = useAppStore((s) => s.load);
  const setPlayerOpen = useAppStore((s) => s.setPlayerOpen);
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);
  const library = useAppStore((s) => s.library);
  const hydrate = useShellStore((s) => s.hydrate);
  const space = useShellStore((s) => s.space);
  const campaignOpen = useCampaignStore((s) => !!s.current);

  useEffect(() => {
    void load();
    return window.trifold.on('playerWindowChanged', ({ open }) => setPlayerOpen(open));
  }, [load, setPlayerOpen]);

  // Layouts and each campaign's console belong to the Library; a Library switch loads its own.
  useEffect(() => {
    if (library?.ok) hydrate(library.path, library.settings?.workspace);
  }, [library, hydrate]);

  // The console exists only while a campaign is open (Decision 2).
  useEffect(
    () =>
      useCampaignStore.subscribe((s, prev) => {
        if (s.current?.campaign.id === prev.current?.campaign.id) return;
        if (s.current) useShellStore.getState().enterConsole(s.current.campaign.slug);
        else useShellStore.getState().leaveCampaign();
      }),
    [],
  );

  // The dock trims itself for narrow windows (ADR 0004 §4).
  useEffect(() => {
    const onResize = () => useShellStore.getState().setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Music volumes, crossfade and output device live in the Library settings.
  const musicSettings = useAppStore((s) => s.library?.settings?.music ?? null);
  useEffect(() => {
    if (musicSettings) useMusicStore.getState().applySettings(musicSettings);
  }, [musicSettings]);
  useEffect(() => {
    void useMusicStore.getState().load();
    void useCampaignStore.getState().load();
  }, []);

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

  // A fight that starts anywhere brings Encounters (now the tracker) forward, beside the map.
  useEffect(
    () =>
      useCombatStore.subscribe((s, prev) => {
        if (s.encounterId && s.encounterId !== prev.encounterId) {
          useShellStore.getState().openMajor('encounters', { avoid: 'map' });
        }
      }),
    [],
  );

  useEffect(() => {
    const shell = () => useShellStore.getState();
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
          if (shell().space !== 'console') return;
          shell().openMajor('compendium', { avoid: 'encounters' });
          window.setTimeout(() => {
            document
              .querySelector<HTMLInputElement>(
                '[data-major="compendium"]:not([hidden]) .compendium input[type="text"]',
              )
              ?.focus();
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
        id: 'music.loop',
        combo: 'Ctrl+Alt+L',
        description: 'Cycle music loop: off, playlist, track',
        run: () => void useMusicStore.getState().cycleLoop(),
      }),
      registerHotkey({
        id: 'music.panic',
        combo: 'Ctrl+Alt+M',
        description: 'Panic mute all audio',
        run: () => useMusicStore.getState().toggleMuted(),
      }),
      registerHotkey({
        id: 'tool.dice',
        combo: 'Ctrl+D',
        description: 'Dice',
        run: () => shell().openTool('dice'),
      }),
      registerHotkey({
        id: 'tool.music',
        combo: 'Ctrl+M',
        description: 'Music: transport, playlists, tracks',
        run: () => shell().openTool('music'),
      }),
      registerHotkey({
        id: 'tool.tv',
        combo: 'Ctrl+T',
        description: 'TV controls',
        run: () => shell().openTool('tv'),
      }),
      registerHotkey({
        id: 'tool.keys',
        combo: 'Ctrl+/',
        description: 'Hotkey sheet',
        run: () => shell().openTool('hotkeys'),
      }),
      registerHotkey({
        id: 'flyout.close',
        combo: 'Escape',
        description: 'Close the open flyout',
        run: () => shell().closeFlyout(),
      }),
      registerHotkey({
        id: 'nav.settings',
        combo: 'Ctrl+,',
        description: 'Settings, in the Library',
        run: () => shell().enterLibrary('settings'),
      }),
      registerHotkey({
        id: 'stage.maximize',
        combo: 'Ctrl+Shift+M',
        description: 'Maximize or restore the focused stage group',
        run: () => {
          if (shell().space === 'console') shell().toggleMaximize();
        },
      }),
      ...Array.from({ length: 9 }, (_, i) =>
        registerHotkey({
          id: `layout.${i + 1}`,
          combo: `Ctrl+${i + 1}`,
          description: `Apply layout ${i + 1}`,
          run: () => shell().applyLayout(i),
        }),
      ),
      installHotkeys(),
    ];
    return () => cleanups.forEach((off) => off());
  }, []);

  return (
    <div className={`shell ${space}`}>
      <TopBar />
      {error && (
        <div className="banner error shell-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="btn small" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {library && !library.ok && (
        <div className="banner warn shell-banner">
          <span>
            The Library at {library.path} could not be opened: {library.error}
          </span>
        </div>
      )}
      {space === 'console' && campaignOpen ? (
        <main className="console">
          <Stage />
          <Dock />
        </main>
      ) : (
        <LibraryView />
      )}
      {campaignOpen && <LiveStrip />}
      <Flyout />
      <CloseCampaignPrompt />
    </div>
  );
}

import { useAppStore } from '../../stores/appStore';
import { useCombatStore } from '../../stores/combatStore';
import { useMusicStore } from '../../stores/musicStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useShellStore } from '../../stores/shellStore';
import { DicePool } from '../dice/DicePool';
import { Icon } from './icons';

/**
 * The live strip (ADR 0004 §2.2): table-time state and the one-tap actions, nothing else.
 * Sections: TV, Combat, Music, Dice. Clicking a section's text opens its tool or tab.
 */
export function LiveStrip() {
  return (
    <footer className="strip" role="contentinfo" data-testid="live-strip">
      <TvSection />
      <CombatSection />
      <MusicSection />
      <DiceSection />
    </footer>
  );
}

function TvSection() {
  const scene = usePresenterStore((s) => s.state.scene);
  const blackout = usePresenterStore((s) => s.state.blackout);
  const history = usePresenterStore((s) => s.history.length);
  const toggleBlackout = usePresenterStore((s) => s.toggleBlackout);
  const undo = usePresenterStore((s) => s.undo);
  const playerOpen = useAppStore((s) => s.playerOpen);
  const openPlayer = useAppStore((s) => s.openPlayer);
  const closePlayer = useAppStore((s) => s.closePlayer);
  const openTool = useShellStore((s) => s.openTool);
  return (
    <div className="strip-sec" data-strip="tv">
      <Icon name="tv" size={15} />
      <button
        type="button"
        className="strip-text"
        onClick={() => openTool('tv')}
        title="TV controls (Ctrl+T)"
      >
        {blackout ? (
          <span className="warn-text">Blackout</span>
        ) : scene ? (
          <>
            <span className="pip" /> <span data-testid="live-status">Live: {scene.title}</span>
          </>
        ) : (
          <span className="muted">Nothing live</span>
        )}
      </button>
      <button
        type="button"
        className={`btn small${blackout ? ' primary' : ''}`}
        aria-pressed={blackout}
        onClick={toggleBlackout}
        title="Blackout (Ctrl+Shift+B)"
      >
        Blackout
      </button>
      <button
        type="button"
        className={`chrome-btn${playerOpen ? ' on' : ''}`}
        aria-label={playerOpen ? 'Close player window' : 'Open player window'}
        title={`${playerOpen ? 'Close' : 'Open'} player window (Ctrl+Shift+P)`}
        onClick={() => void (playerOpen ? closePlayer() : openPlayer())}
      >
        <Icon name="tv" size={15} />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label="Undo last scene"
        title="Undo last scene (Ctrl+Shift+Z)"
        disabled={history === 0}
        onClick={undo}
      >
        <Icon name="undo" size={15} />
      </button>
    </div>
  );
}

function CombatSection() {
  const state = useCombatStore((s) => s.state);
  const next = useCombatStore((s) => s.next);
  const previous = useCombatStore((s) => s.previous);
  const setBrowsing = useCombatStore((s) => s.setBrowsing);
  const openMajor = useShellStore((s) => s.openMajor);
  const started = !!state && state.turnIndex >= 0;
  const active = started ? state.combatants[state.turnIndex] : undefined;
  return (
    <div className="strip-sec" data-strip="combat">
      <Icon name="combat" size={15} />
      <button
        type="button"
        className="strip-text"
        onClick={() => {
          setBrowsing(false);
          openMajor('encounters', { avoid: 'map' });
        }}
        title="Show the fight"
      >
        {!state ? (
          <span className="muted">No fight</span>
        ) : started ? (
          <>
            Round {state.round}
            {active ? <span className="muted"> · {active.name}</span> : null}
          </>
        ) : (
          'Set initiative'
        )}
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label="Back a turn"
        disabled={!started}
        onClick={previous}
        title="Previous turn (P)"
      >
        <Icon name="prev" size={15} />
      </button>
      <button
        type="button"
        className={`chrome-btn${started ? ' primary' : ''}`}
        aria-label="Advance turn"
        disabled={!started}
        onClick={next}
        title="Next turn (N)"
      >
        <Icon name="next" size={15} />
      </button>
    </div>
  );
}

function MusicSection() {
  const nowPlayingId = useMusicStore((s) => s.order[s.index] ?? null);
  const title = useMusicStore(
    (s) => s.library?.tracks.find((t) => t.id === nowPlayingId)?.title ?? null,
  );
  const playlist = useMusicStore(
    (s) => s.playlists.find((p) => p.id === s.playlistId)?.name ?? null,
  );
  const playing = useMusicStore((s) => s.playing);
  const muted = useMusicStore((s) => s.muted);
  const hasQueue = useMusicStore((s) => s.order.length > 0);
  const togglePlay = useMusicStore((s) => s.togglePlay);
  const next = useMusicStore((s) => s.next);
  const previous = useMusicStore((s) => s.previous);
  const toggleMuted = useMusicStore((s) => s.toggleMuted);
  const openTool = useShellStore((s) => s.openTool);
  return (
    <div className="strip-sec" data-strip="music">
      <Icon name="music" size={15} />
      <button
        type="button"
        className="strip-text"
        onClick={() => openTool('music')}
        title="Music (Ctrl+M)"
      >
        {muted ? (
          <span className="warn-text">Muted</span>
        ) : title ? (
          <>
            {playlist ? <span className="muted">{playlist} · </span> : null}
            {title}
          </>
        ) : (
          <span className="muted">No music</span>
        )}
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label="Previous track"
        disabled={!hasQueue}
        onClick={() => void previous()}
        title="Previous track (Ctrl+Alt+Left)"
      >
        <Icon name="prev" size={15} />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label={playing ? 'Pause music' : 'Play music'}
        disabled={!hasQueue}
        onClick={() => void togglePlay()}
        title="Play or pause (Ctrl+Alt+P)"
      >
        <Icon name={playing ? 'pause' : 'play'} size={15} />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label="Next track"
        disabled={!hasQueue}
        onClick={() => void next()}
        title="Next track (Ctrl+Alt+Right)"
      >
        <Icon name="next" size={15} />
      </button>
      <button
        type="button"
        className={`chrome-btn${muted ? ' primary' : ''}`}
        aria-label={muted ? 'Unmute all audio' : 'Mute all audio'}
        aria-pressed={muted}
        onClick={toggleMuted}
        title="Panic mute (Ctrl+Alt+M)"
      >
        <Icon name="mute" size={15} />
      </button>
    </div>
  );
}

function DiceSection() {
  const openTool = useShellStore((s) => s.openTool);
  return (
    <div className="strip-sec" data-strip="dice">
      <button
        type="button"
        className="chrome-btn"
        aria-label="Dice"
        title="Dice (Ctrl+D)"
        onClick={() => openTool('dice')}
      >
        <Icon name="dice" size={15} />
      </button>
      <DicePool compact />
    </div>
  );
}

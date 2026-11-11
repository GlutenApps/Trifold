import { useAppStore } from '../../stores/appStore';
import { useCombatStore } from '../../stores/combatStore';
import type { PhoneAudioStatus } from '@trifold/api';
import { useMusicStore } from '../../stores/musicStore';
import { usePhoneAudioStore } from '../../stores/phoneAudioStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useShellStore } from '../../stores/shellStore';
import { DicePool } from '../dice/DicePool';
import { Icon } from './icons';
import { hk } from '../../platform';

/**
 * The live strip (ADR 0004, live strip): table-time state and the one-tap actions, nothing else.
 * Sections: TV, Combat, Music, then Dice at the right end. Clicking a section's text opens its
 * tool or tab; the dice button pops the Dice tool up from the strip (ADR 0009).
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
  const openMajor = useShellStore((s) => s.openMajor);
  return (
    <div className="strip-sec" data-strip="tv">
      <Icon name="tv" size={15} />
      <button
        type="button"
        className="strip-text"
        onClick={() => openMajor('map', { avoid: 'encounters' })}
        title={`VTT: the scene on the TV (${hk('Ctrl+T')})`}
      >
        {!scene ? (
          <span className="muted">Nothing live</span>
        ) : blackout ? (
          <span className="warn-text">Blackout</span>
        ) : (
          <>
            <span className="pip" /> <span data-testid="live-status">Live: {scene.title}</span>
          </>
        )}
      </button>
      <button
        type="button"
        className={`btn${blackout && scene ? ' primary' : ''}`}
        aria-pressed={blackout && !!scene}
        disabled={!scene}
        onClick={toggleBlackout}
        title={scene ? `Blackout (${hk('Ctrl+Shift+B')})` : 'Nothing is on the TV to black out'}
      >
        Blackout
      </button>
      <button
        type="button"
        className={`chrome-btn${playerOpen ? ' tally' : ''}`}
        aria-label={playerOpen ? 'Close TV (tray)' : 'Open TV (tray)'}
        aria-pressed={playerOpen}
        title={`${playerOpen ? 'TV on: the players can see it. Click to close it' : 'Open the TV on the second display'} (${hk('Ctrl+Shift+P')})`}
        onClick={() => void (playerOpen ? closePlayer() : openPlayer())}
      >
        <Icon name="window" />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label="Undo last scene"
        title={`Undo last scene (${hk('Ctrl+Shift+Z')})`}
        disabled={history === 0}
        onClick={undo}
      >
        <Icon name="undo" />
      </button>
    </div>
  );
}

function CombatSection() {
  const state = useCombatStore((s) => s.state);
  const next = useCombatStore((s) => s.next);
  const previous = useCombatStore((s) => s.previous);
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
        <Icon name="prev" />
      </button>
      <button
        type="button"
        className={`chrome-btn${started ? ' primary' : ''}`}
        aria-label="Advance turn"
        disabled={!started}
        onClick={next}
        title="Next turn (N)"
      >
        <Icon name="next" />
      </button>
    </div>
  );
}

const PHONE_STATE: Record<PhoneAudioStatus['state'], string> = {
  off: 'not connected',
  connecting: 'connecting…',
  connected: 'playing through this computer',
  reconnecting: 'reconnecting…',
  failed: 'could not connect',
};

/** Phone as the source (ADR 0007): what is connected and one button, no player controls. */
function PhoneSection() {
  const status = usePhoneAudioStore((s) => s.status);
  const connect = usePhoneAudioStore((s) => s.connect);
  const disconnect = usePhoneAudioStore((s) => s.disconnect);
  const openTool = useShellStore((s) => s.openTool);
  const active = status.state !== 'off';
  const last = status.remembered[0] ?? null;
  const text = !status.supported
    ? 'Phone audio via AirPlay'
    : active && status.device
      ? `${status.device.name} · ${PHONE_STATE[status.state]}`
      : last
        ? `${last.name} · not connected`
        : 'No phone connected';
  return (
    <div className="strip-sec" data-strip="phone">
      <Icon name="music" size={15} />
      <button
        type="button"
        className="strip-text"
        onClick={() => openTool('music')}
        title={`Phone audio (${hk('Ctrl+M')})`}
      >
        {status.state === 'failed' ? <span className="warn-text">{text}</span> : text}
      </button>
      {status.supported &&
        (active && status.state !== 'failed' ? (
          <button type="button" className="btn" onClick={() => void disconnect()}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              last ? void connect({ id: last.id, name: last.name }) : openTool('music')
            }
          >
            {last ? (active ? 'Try again' : 'Connect') : 'Choose phone'}
          </button>
        ))}
    </div>
  );
}

function MusicSection() {
  const source = useMusicStore((s) => s.source);
  return source === 'phone' ? <PhoneSection /> : <PlayerSection />;
}

function PlayerSection() {
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
        title={`Music (${hk('Ctrl+M')})`}
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
        title={`Previous track (${hk('Ctrl+Alt+Left')})`}
      >
        <Icon name="prev" />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label={playing ? 'Pause music' : 'Play music'}
        disabled={!hasQueue}
        onClick={() => void togglePlay()}
        title={`Play or pause (${hk('Ctrl+Alt+P')})`}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <button
        type="button"
        className="chrome-btn"
        aria-label="Next track"
        disabled={!hasQueue}
        onClick={() => void next()}
        title={`Next track (${hk('Ctrl+Alt+Right')})`}
      >
        <Icon name="next" />
      </button>
      <button
        type="button"
        className={`chrome-btn${muted ? ' primary' : ''}`}
        aria-label={muted ? 'Unmute all audio' : 'Mute all audio'}
        aria-pressed={muted}
        onClick={toggleMuted}
        title={`Panic mute (${hk('Ctrl+Alt+M')})`}
      >
        <Icon name="mute" />
      </button>
    </div>
  );
}

function DiceSection() {
  const pop = useShellStore((s) => s.pop);
  const togglePop = useShellStore((s) => s.togglePop);
  return (
    <div className="strip-sec" data-strip="dice">
      <DicePool compact />
      <button
        type="button"
        className={`chrome-btn${pop === 'dice' ? ' on' : ''}`}
        aria-label="Dice"
        aria-haspopup="dialog"
        aria-expanded={pop === 'dice'}
        data-pop="dice"
        title={`Dice (${hk('Ctrl+D')})`}
        onClick={() => togglePop('dice')}
      >
        <Icon name="dice" />
      </button>
    </div>
  );
}

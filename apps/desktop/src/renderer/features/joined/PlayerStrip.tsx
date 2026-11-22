import { hk } from '../../platform';
import { useShellStore } from '../../stores/shellStore';
import { useTableRollStore } from '../../stores/tableRollStore';
import { DicePool } from '../dice/DicePool';
import { Icon } from '../shell/icons';
import { linkText, usePlayerTable } from './PlayerTable';

/**
 * The player console's strip (docs/PLAYER-MODE.md, "Its own composition"): table state only, and
 * fixed, where the GM's is chosen. The link to the GM's table, the round when the TV shows it,
 * and whether one of the player's creatures is acting or is next (ADR 0057); then Dice at the
 * right end, as on the GM's strip: the compact pool and the button for the Dice pop-up. A
 * player's rolls stay on this computer.
 */
export function PlayerStrip() {
  const { conn } = usePlayerTable();
  const view = conn.link === 'open' ? conn.view : null;
  const acting = view?.mine.find((c) => c.turn === 'now');
  const next = view?.mine.find((c) => c.turn === 'next');
  const several = (view?.mine.length ?? 0) > 1;
  const round = view?.overlays?.round ?? view?.overlays?.initiative?.round;
  const pop = useShellStore((s) => s.pop);
  const togglePop = useShellStore((s) => s.togglePop);
  // Whether the pool's Roll is seen by the table or only here (ADR 0059); changed in the Dice pop-up.
  const toTable = useTableRollStore((s) => s.mode === 'table' && !!s.send);
  return (
    <footer className="strip player-strip" role="contentinfo" data-testid="player-strip">
      <div className="strip-sections">
        <div className="strip-sec" data-strip="link">
          <span className={`pip${conn.link === 'open' ? '' : ' alert'}`} aria-hidden="true" />
          <span className="strip-text" role="status" data-testid="player-link">
            {linkText(conn.link)}
          </span>
        </div>
        {round !== undefined && (
          <div className="strip-sec" data-strip="round">
            <span className="strip-text">Round {round}</span>
          </div>
        )}
        {(acting || next) && (
          <div className="strip-sec" data-strip="turn">
            <span className="strip-text" role="status" data-testid="player-turn">
              <strong>{acting ? 'Your turn' : 'You’re next'}</strong>
              {several ? `: ${(acting ?? next)!.name}` : ''}
            </span>
          </div>
        )}
      </div>
      <div className="strip-sec" data-strip="dice">
        <span
          className={`badge${toTable ? ' on' : ''}`}
          data-testid="roll-mode"
          title={
            toTable
              ? 'Table: rolled on your GM’s computer, and everyone at the table sees it. Change it in Dice.'
              : 'Private: rolled here, and nobody else sees it. Change it in Dice.'
          }
        >
          {toTable ? 'Table' : 'Private'}
        </span>
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
    </footer>
  );
}

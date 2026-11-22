import { linkText, usePlayerTable } from './PlayerTable';

/**
 * The player console's strip (docs/PLAYER-MODE.md, "Its own composition"): table state only, and
 * fixed, where the GM's is chosen. The link to the GM's table, the round when the TV shows it,
 * and whether one of the player's creatures is acting or is next (ADR 0057).
 */
export function PlayerStrip() {
  const { conn } = usePlayerTable();
  const view = conn.link === 'open' ? conn.view : null;
  const acting = view?.mine.find((c) => c.turn === 'now');
  const next = view?.mine.find((c) => c.turn === 'next');
  const several = (view?.mine.length ?? 0) > 1;
  const round = view?.overlays?.round ?? view?.overlays?.initiative?.round;
  return (
    <footer className="strip" role="contentinfo" data-testid="player-strip">
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
    </footer>
  );
}

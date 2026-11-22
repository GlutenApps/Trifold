import { InitiativeCard } from '../../../web/Playing';
import { linkSentence, usePlayerTable } from './PlayerTable';
import '../../../web/web.css';

/**
 * Initiative (docs/PLAYER-MODE.md, "Panels"): the player console's view of the fight's order.
 * The box to enter a roll when the tracker is waiting for one of the player's creatures; then
 * the order as the TV shows it, with whose turn it is. The order follows the TV's initiative
 * strip (ADR 0046): with that overlay off there is no order to show, and the player is still
 * told when their own turn comes (ADR 0057).
 */
export function InitiativeTool() {
  const { conn } = usePlayerTable();
  const view = conn.link === 'open' ? conn.view : null;
  if (!view) {
    return (
      <p className="muted small initiative-empty" role="status">
        {linkSentence(conn.link)}
      </p>
    );
  }
  const waiting = view.mine.filter((c) => c.needsInitiative);
  const order = view.overlays?.initiative;
  const round = view.overlays?.round ?? order?.round;
  const acting = view.mine.find((c) => c.turn === 'now');
  const next = view.mine.find((c) => c.turn === 'next');
  const fighting = view.mine.some((c) => c.inFight);

  return (
    <div className="initiative-tool" data-testid="initiative-tool">
      {waiting.length > 0 && (
        <div className="pc-host initiative-rolls">
          {waiting.map((c) => (
            <InitiativeCard
              key={`${c.kind}:${c.id}`}
              creature={c}
              onSubmit={(value) =>
                conn.send({
                  type: 'intent',
                  creatureKind: c.kind,
                  creatureId: c.id,
                  intent: { kind: 'initiative', value },
                })
              }
            />
          ))}
        </div>
      )}
      {(acting || next) && (
        <p className="initiative-turn" role="status">
          <strong>{acting ? 'Your turn' : 'You’re next'}</strong>
          {view.mine.length > 1 ? `: ${(acting ?? next)!.name}` : ''}
        </p>
      )}
      {order ? (
        <>
          <p className="muted small">Round {order.round}</p>
          <ol className="initiative-order" aria-label="Turn order">
            {order.entries.map((e) => {
              const active = e.id === order.activeId;
              return (
                <li
                  key={e.id}
                  className={`initiative-entry role-${e.role}${active ? ' active' : ''}${e.dead ? ' dead' : ''}`}
                  aria-current={active ? 'true' : undefined}
                >
                  <span className="initiative-name">{e.name}</span>
                  {e.dead ? (
                    <span className="muted small">down</span>
                  ) : e.bloodied ? (
                    <span className="badge warn">bloodied</span>
                  ) : null}
                  {active && <span className="badge on">acting</span>}
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="muted small" role="status">
          {fighting
            ? `${round !== undefined ? `Round ${round}. ` : ''}Your GM isn’t showing the turn order.`
            : 'No fight is running.'}
        </p>
      )}
    </div>
  );
}

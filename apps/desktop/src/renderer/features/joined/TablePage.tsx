import type { ClientView } from '@trifold/api';
import type { Connection } from '../../../web/connection';
import { MapView } from '../../../web/MapView';
import { Picker } from '../../../web/Picker';
import { InitiativeCard } from '../../../web/Playing';
import { ScreenView } from '../../../web/ScreenView';
import { TvBottom, TvTop } from '../../../web/TvOverlays';
import { useMovePlan } from '../../../web/useMovePlan';
import { rulerLabel } from '../presenter/ruler';
import { linkText, usePlayerTable } from './PlayerTable';
import '../../../web/web.css';

/**
 * The player console's VTT tab (docs/PLAYER-MODE.md, "Panels"): what the table shows this
 * player. The map with its fog and the tokens they may see, or the TV's title, image or break
 * screen, with the TV's overlays; the character picker while they hold nothing; and a plain
 * line while the table is not up. It is drawn with the phone page's own map and picker, from
 * the same per-device view, so nothing here knows more than a phone would.
 */
export function TablePage() {
  const { campaign, conn } = usePlayerTable();
  const { view } = conn;
  return (
    <div className="player-table pc-host" data-testid="player-table">
      {conn.error && (
        <div className="banner error" role="alert">
          <span>{conn.error}</span>
          <button type="button" className="btn small" onClick={conn.clearError}>
            Dismiss
          </button>
        </div>
      )}
      {!view || conn.link !== 'open' ? (
        <div className="player-table-wait" role="status">
          <p>{linkText(conn.link)}</p>
          <p className="muted small">
            This tab fills in by itself when your GM lets players join and you are on the same
            network.
          </p>
        </div>
      ) : view.mine.length === 0 ? (
        <Picker view={view} conn={conn} deviceName={campaign.displayName} />
      ) : (
        <Table view={view} conn={conn} />
      )}
    </div>
  );
}

/** The table while the player holds a character: the map or screen, and moving their tokens. */
function Table({ view, conn }: { view: ClientView; conn: Connection }) {
  const { plan, drag, cancelMove, confirmMove, planSquares } = useMovePlan({ view, conn });
  // PCs first: the token the map centres on and selects is the player's own character's.
  const me = view.mine.find((c) => !c.companionOf && c.kind !== 'summon') ?? view.mine[0]!;
  const moving = plan ? view.mine.find((c) => c.tokenId === plan.tokenId) : undefined;
  const onBreak = view.screen?.kind === 'break';
  const tv = view.overlays && !onBreak ? view.overlays : null;
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const overlay = (
    <>
      <div className="pc-overlay-top" onPointerDown={stop} onPointerUp={stop}>
        {tv && <TvTop overlays={tv} />}
        {view.mine
          .filter((c) => c.needsInitiative)
          .map((c) => (
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
        {me.movementLocked && me.tokenId && !plan && (
          <div className="pc-movebanner locked" role="status">
            Movement locked by the DM
          </div>
        )}
        {plan && (
          <div className="pc-movebanner player-move" role="status">
            <span>
              Moving {moving?.name ?? 'your token'}: {rulerLabel(planSquares)}
            </span>
            <button type="button" className="btn small" onClick={cancelMove}>
              Cancel
            </button>
            <button
              type="button"
              className="btn small primary"
              disabled={plan.sending}
              onClick={confirmMove}
            >
              {plan.sending ? 'Moving…' : 'Move here'}
            </button>
          </div>
        )}
      </div>
      {tv && <TvBottom overlays={tv} />}
    </>
  );

  if (view.map && !onBreak) {
    return (
      <MapView
        map={view.map}
        selectedTokenId={me.tokenId ?? null}
        onSelectToken={() => undefined}
        drag={drag}
        centerOn={me.tokenId ?? null}
        overlay={overlay}
      />
    );
  }
  if (view.screen) {
    return (
      <div className="pc-map pc-screen-wrap">
        <ScreenView screen={view.screen} />
        {overlay}
      </div>
    );
  }
  return (
    <div className="pc-map pc-center">
      {overlay}
      <p className="pc-hint" data-testid="pc-waiting">
        {view.live ? 'Nothing on the TV right now.' : 'Waiting for the DM to go live.'}
      </p>
    </div>
  );
}

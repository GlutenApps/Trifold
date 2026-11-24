import type { ClientView } from '@trifold/api';
import type { Connection } from '../../../playerUi/connection';
import { MapView } from '../../../playerUi/MapView';
import { Picker } from '../../../playerUi/Picker';
import { ScreenView } from '../../../playerUi/ScreenView';
import { TvBottom, TvTop } from '../../../playerUi/TvOverlays';
import { useMovePlan } from '../../../playerUi/useMovePlan';
import { rulerLabel } from '../presenter/ruler';
import { tableNumbers } from '@trifold/rules';
import { ChangeAddress } from './ChangeAddress';
import { useLinkedCharacter } from './CharacterLink';
import { creatureKeyOf, lastSeenText, linkSentence, linkText, usePlayerTable } from './PlayerTable';
import '../../../playerUi/web.css';

/**
 * The player console's VTT tab (docs/PLAYER-MODE.md, "Panels"): what the table shows this
 * player. The map with its fog and the tokens they may see, or the TV's title, image or break
 * screen, with the TV's overlays; the character picker while they hold nothing; and, while the
 * table is not up, the map as they last saw it, to look at only. It is drawn with the phone page's own map and picker, from
 * the same per-device view, so nothing here knows more than a phone would.
 */
export function TablePage() {
  const { campaign, conn, last } = usePlayerTable();
  const { view } = conn;
  // Not at the table: the last map this player saw, if they held a character on one.
  const lastMap =
    last && last.view.mine.length > 0 && last.view.screen?.kind !== 'break' ? last.view.map : null;
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
      {/* Not at the table, and not because it is running another campaign: the search may be blocked. */}
      {conn.link !== 'open' && conn.link !== 'otherCampaign' && <ChangeAddress />}
      {conn.link !== 'open' && last && lastMap ? (
        <MapView
          map={lastMap}
          selectedTokenId={null}
          onSelectToken={() => undefined}
          centerOn={last.view.mine.find((c) => c.tokenId)?.tokenId ?? null}
          overlay={
            <div className="pc-overlay-top">
              <div className="pc-movebanner locked player-last" role="status">
                {linkSentence(conn.link)} This is the map as you last saw it,{' '}
                {lastSeenText(last.at)}.
              </div>
            </div>
          }
        />
      ) : !view || conn.link !== 'open' ? (
        <div className="player-table-wait" role="status">
          <p>{linkText(conn.link)}</p>
          <p className="muted small">
            This tab fills in by itself when your GM lets players join and you are on the same
            network.
          </p>
        </div>
      ) : view.mine.length === 0 ? (
        <>
          <Picker view={view} conn={conn} deviceName={campaign.displayName} />
          {!conn.waiting && <AskForNewPc conn={conn} label={campaign.displayName} />}
        </>
      ) : (
        <Table view={view} conn={conn} />
      )}
    </div>
  );
}

/**
 * New PC from player sheet (ADR 0072): holding nothing, a player whose character is linked here
 * asks the GM to add it as a new PC. The GM makes the card from its numbers and hands it over.
 */
function AskForNewPc({ conn, label }: { conn: Connection; label: string }) {
  const { character } = useLinkedCharacter();
  if (!character) return null;
  return (
    <div className="row ask-new-pc" data-testid="ask-new-pc">
      <span className="muted small grow">Not on the list?</span>
      <button
        type="button"
        className="btn"
        onClick={() =>
          conn.send({
            type: 'sheetOffer',
            label,
            offer: {
              name: character.name,
              numbers: tableNumbers(character),
              ...(character.sheetUrl ? { sheetUrl: character.sheetUrl } : {}),
            },
          })
        }
      >
        Ask your GM to add {character.name}
      </button>
    </div>
  );
}

/** The table while the player holds a character: the map or screen, and moving their tokens. */
function Table({ view, conn }: { view: ClientView; conn: Connection }) {
  const { selected, select } = usePlayerTable();
  const { plan, drag, cancelMove, confirmMove, planSquares } = useMovePlan({
    view,
    conn,
    // Moving a token selects its creature, as picking its row in My characters does.
    onBegin: (tokenId) => {
      const hit = view.mine.find((c) => c.tokenId === tokenId);
      if (hit) select(creatureKeyOf(hit));
    },
  });
  // The map frames the creature picked in My characters; until one is, the player's character.
  const me =
    view.mine.find((c) => creatureKeyOf(c) === selected) ??
    view.mine.find((c) => !c.companionOf && c.kind !== 'summon') ??
    view.mine[0]!;
  const moving = plan ? view.mine.find((c) => c.tokenId === plan.tokenId) : undefined;
  const onBreak = view.screen?.kind === 'break';
  const tv = view.overlays && !onBreak ? view.overlays : null;
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const overlay = (
    <>
      <div className="pc-overlay-top" onPointerDown={stop} onPointerUp={stop}>
        {tv && <TvTop overlays={tv} />}
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
        onSelectToken={(tokenId) => {
          const hit = view.mine.find((c) => c.tokenId === tokenId);
          if (hit) select(creatureKeyOf(hit));
        }}
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

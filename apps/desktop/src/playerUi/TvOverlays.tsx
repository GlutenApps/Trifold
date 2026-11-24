import type { TableOverlays } from '@trifold/api';
import { InitiativeStrip } from '../renderer/features/presenter/InitiativeStrip';
import { TvCorner } from '../renderer/features/presenter/TvCorner';
import { dmNow } from './clock';

/**
 * The TV's overlays on a phone (ADR 0046): phones show what the TV shows. The top row carries the
 * scene's name, the round and the initiative strip (the TV's own, so it folds into "+N" on a
 * narrow screen); the bottom-left corner the timer and counters, counting on the DM's clock.
 * Nothing here takes a touch, so the map under it still pans and drags.
 */
export function TvTop({ overlays }: { overlays: TableOverlays }) {
  const { sceneTitle, initiative, round } = overlays;
  if (!sceneTitle && !initiative && round === undefined) return null;
  return (
    <div className="pc-tv-top" data-testid="pc-tv-top">
      {sceneTitle && (
        <div className="pc-tv-title" data-testid="pc-tv-title">
          {sceneTitle}
        </div>
      )}
      {round !== undefined && (
        <div className="pc-tv-round" data-testid="pc-tv-round">
          Round {round}
        </div>
      )}
      {initiative && <InitiativeStrip combat={initiative} healthBars={overlays.healthBars} />}
    </div>
  );
}

export function TvBottom({ overlays }: { overlays: TableOverlays }) {
  if (!overlays.timer && overlays.counters.length === 0) return null;
  return (
    <div className="pc-tv-corner">
      <TvCorner timer={overlays.timer} counters={overlays.counters} now={dmNow} />
    </div>
  );
}

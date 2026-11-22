import { CampaignPage } from '../campaign/CampaignPage';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { EncountersPage } from '../encounters/EncountersPage';
import { TvPage } from '../presenter/TvPage';
import { TablePage } from '../joined/TablePage';
import type { AnyMajorKind } from '../../stores/shellLayout';
import type { IconName } from './icons';

/**
 * The majors (ADR 0004): the features that live as stage tabs, keyed by the schema's
 * `MajorKind` for the GM's console and `PlayerMajorKind` for the player's (docs/PLAYER-MODE.md).
 * This is the only place a kind meets its page and icon; the stage and the + menu go through it,
 * and the `map` key is the TV tab (ADR 0008). Compendium is the same tab in both consoles.
 */
export const MAJOR_ICON: Record<AnyMajorKind, IconName> = {
  campaign: 'campaign',
  compendium: 'compendium',
  encounters: 'encounters',
  map: 'tv',
  table: 'map',
  sheets: 'card',
};

/** A panel of the player console that is still to come; only seen with player mode switched on. */
function Pending({ children }: { children: string }) {
  return <p className="muted panel-pending">{children}</p>;
}

/** Major kind → the feature that fills its tab. Titles live with the layout math. */
export function MajorBody({ kind }: { kind: AnyMajorKind }) {
  switch (kind) {
    case 'campaign':
      return <CampaignPage />;
    case 'compendium':
      return <CompendiumPage />;
    case 'encounters':
      return <EncountersPage />;
    case 'map':
      return <TvPage />;
    case 'table':
      return <TablePage />;
    // Sheets arrives with characters (docs/PLAYER-MODE.md, Part 3).
    case 'sheets':
      return <Pending>Character sheets are not built yet.</Pending>;
  }
}

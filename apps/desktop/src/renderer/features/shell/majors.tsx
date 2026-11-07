import type { MajorKind } from '@trifold/schema';
import { CampaignPage } from '../campaign/CampaignPage';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { EncountersPage } from '../encounters/EncountersPage';
import { TvPage } from '../presenter/TvPage';
import type { IconName } from './icons';

/**
 * The majors (ADR 0004): the features that live as stage tabs, keyed by the schema's
 * `MajorKind`. This is the only place a kind meets its page and icon; the stage and the +
 * menu go through it, and the `map` key is the TV tab (ADR 0008).
 */
export const MAJOR_ICON: Record<MajorKind, IconName> = {
  campaign: 'campaign',
  compendium: 'compendium',
  encounters: 'encounters',
  map: 'tv',
};

/** Major kind → the feature that fills its tab. Titles live with the layout math. */
export function MajorBody({ kind }: { kind: MajorKind }) {
  switch (kind) {
    case 'campaign':
      return <CampaignPage />;
    case 'compendium':
      return <CompendiumPage />;
    case 'encounters':
      return <EncountersPage />;
    case 'map':
      return <TvPage />;
  }
}

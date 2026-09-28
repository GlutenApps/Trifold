import type { MajorKind } from '@trifold/schema';
import { CampaignPage } from '../campaign/CampaignPage';
import { CompendiumPage } from '../compendium/CompendiumPage';
import { EncountersPage } from '../encounters/EncountersPage';
import { MapPage } from '../presenter/MapPage';
import type { IconName } from './icons';

export const MAJOR_ICON: Record<MajorKind, IconName> = {
  campaign: 'campaign',
  compendium: 'compendium',
  encounters: 'encounters',
  map: 'grid',
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
      return <MapPage />;
  }
}

import type { CompendiumRecord, MonsterRecord, SummonableEntry } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { Icon } from '../shell/icons';

/** The cached entry for the DM's summon list: what the table needs without the record. */
export function summonableEntry(record: MonsterRecord): SummonableEntry {
  return {
    ref: {
      recordId: record.id,
      sourceId: record.sourceId,
      key: record.key,
      edition: record.edition,
    },
    name: record.displayName,
    type: record.data.type,
    size: record.data.size ?? null,
    ac: record.data.ac?.value ?? null,
    hp: record.data.hp?.average ?? null,
  };
}

/**
 * Summonable by players (ADR 0043): puts a creature on the open campaign's summon list,
 * which the players' Companions tool offers. Shown on a monster's page while a campaign is open.
 */
export function SummonableToggle({ record }: { record: CompendiumRecord }) {
  const campaign = useCampaignStore((s) => s.current?.campaign);
  const update = useCampaignStore((s) => s.update);
  if (!campaign || record.kind !== 'monster') return null;
  const list = campaign.settings.summonable;
  const on = list.some((e) => e.ref.recordId === record.id);
  return (
    <button
      type="button"
      className={`chrome-btn${on ? ' on' : ''}`}
      aria-label="Available as a companion"
      aria-pressed={on}
      title={
        on
          ? `Players can add ${record.displayName} as a companion from their phones in ${campaign.name}. Click to stop`
          : `Let players add ${record.displayName} as a companion from their phones in ${campaign.name}`
      }
      onClick={() =>
        void update({
          settings: {
            ...campaign.settings,
            summonable: on
              ? list.filter((e) => e.ref.recordId !== record.id)
              : [...list, summonableEntry(record)],
          },
        })
      }
    >
      <Icon name="companion" />
    </button>
  );
}

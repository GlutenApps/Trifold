import { useEffect, useState } from 'react';
import type { CampaignBundle } from '@trifold/api';
import type { CompendiumRecord, NPC } from '@trifold/schema';
import { navigate } from '../../navigate';
import { useCampaignStore } from '../../stores/campaignStore';
import { switchCampaign } from '../shell/campaignFlow';

/**
 * "Used by" under a stat block (DESIGN.md §6.2): the campaign NPCs, in every campaign, whose stat
 * block this record is, each a link to the NPC. The open campaign's NPC opens in place; another
 * campaign's opens that campaign first, as a Library search result does (ADR 0024).
 */

export interface NpcUse {
  campaignId: string;
  campaignName: string;
  npcId: string;
  name: string;
  /** The open campaign's NPC: opens without switching campaigns. */
  here: boolean;
}

/**
 * Whether an NPC's stat block is this record: the same record id, or the same key in the same
 * source (a re-imported source gives its records new ids but keeps their keys).
 */
export function npcUsesRecord(npc: NPC, record: Pick<CompendiumRecord, 'id' | 'key' | 'sourceId'>) {
  const ref = npc.recordRef;
  if (!ref) return false;
  return ref.recordId === record.id || (ref.sourceId === record.sourceId && ref.key === record.key);
}

/** Every NPC in these campaigns that uses the record, the open campaign's first, then by name. */
export function npcUses(
  bundles: readonly CampaignBundle[],
  record: Pick<CompendiumRecord, 'id' | 'key' | 'sourceId'>,
  currentId: string | null,
): NpcUse[] {
  const out: NpcUse[] = [];
  for (const b of bundles) {
    for (const npc of b.npcs) {
      if (!npcUsesRecord(npc, record)) continue;
      out.push({
        campaignId: b.campaign.id,
        campaignName: b.campaign.name,
        npcId: npc.id,
        name: npc.name,
        here: b.campaign.id === currentId,
      });
    }
  }
  return out.sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name));
}

export function UsedBy({ record }: { record: CompendiumRecord }) {
  const current = useCampaignStore((s) => s.current);
  const [uses, setUses] = useState<NpcUse[]>([]);
  const currentId = current?.campaign.id ?? null;

  useEffect(() => {
    let live = true;
    void window.trifold.campaigns
      .bundles()
      .catch(() => [] as CampaignBundle[])
      .then((read) => {
        if (!live) return;
        // The open campaign from the console's copy, which may hold edits not yet re-read.
        const bundles = read.map((b) =>
          current && b.campaign.id === current.campaign.id ? current : b,
        );
        if (current && !bundles.some((b) => b.campaign.id === current.campaign.id))
          bundles.push(current);
        setUses(npcUses(bundles, record, currentId));
      });
    return () => {
      live = false;
    };
  }, [record, current, currentId]);

  if (uses.length === 0) return null;
  return (
    <section className="used-by" aria-label="Used by">
      <h3>Used by</h3>
      <ul>
        {uses.map((u) => (
          <li key={`${u.campaignId}/${u.npcId}`}>
            <button
              type="button"
              className="link"
              title={u.here ? 'Open this NPC' : `Open ${u.campaignName} at this NPC`}
              onClick={() => {
                const open = () => navigate({ type: 'npc', id: u.npcId });
                if (u.here) open();
                else switchCampaign(u.campaignId, open);
              }}
            >
              {u.name}
            </button>
            <span className="muted">, NPC in {u.campaignName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

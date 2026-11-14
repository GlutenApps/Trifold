import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { CompendiumRecord, NPC } from '@trifold/schema';
import { npcUses, UsedBy } from './UsedBy';

const now = '2026-11-13T00:00:00.000Z';

function npc(id: string, name: string, recordRef?: NPC['recordRef']): NPC {
  return {
    schemaVersion: 1,
    id,
    name,
    role: '',
    location: '',
    notes: '',
    isAlive: true,
    createdAt: now,
    updatedAt: now,
    ...(recordRef ? { recordRef } : {}),
  };
}

const bundle = (id: string, name: string, npcs: NPC[]) =>
  ({ campaign: { id, name }, npcs }) as unknown as CampaignBundle;

const captain = { id: 'r1', key: 'bandit captain', sourceId: 'srd' };

describe('npcUses', () => {
  it('matches by record id, or by key in the same source after a re-import', () => {
    const uses = npcUses(
      [
        bundle('c1', 'Greyford', [
          npc('n1', 'Mara Venn', {
            recordId: 'r1',
            sourceId: 'srd',
            key: 'bandit captain',
            edition: '2014',
          }),
          npc('n2', 'Pell Marsh'),
        ]),
        bundle('c2', 'Wild Sheep Chase', [
          npc('n3', 'Old Ivo', {
            recordId: 'gone',
            sourceId: 'srd',
            key: 'bandit captain',
            edition: '2014',
          }),
          npc('n4', 'Other book', {
            recordId: 'x',
            sourceId: 'book',
            key: 'bandit captain',
            edition: '2014',
          }),
        ]),
      ],
      captain,
      'c2',
    );
    expect(uses.map((u) => [u.name, u.campaignName, u.here])).toEqual([
      ['Old Ivo', 'Wild Sheep Chase', true],
      ['Mara Venn', 'Greyford', false],
    ]);
  });
});

describe('UsedBy', () => {
  it('lists the NPCs that use the stat block with their campaigns, and nothing when none do', async () => {
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([
      bundle('c1', 'Greyford', [
        npc('n1', 'Mara Venn', {
          recordId: 'r1',
          sourceId: 'srd',
          key: 'bandit captain',
          edition: '2014',
        }),
      ]),
    ]);
    const record = { ...captain, kind: 'monster', name: 'Bandit Captain' } as CompendiumRecord;
    const { rerender } = render(<UsedBy record={record} />);
    const section = await screen.findByRole('region', { name: 'Used by' });
    expect(within(section).getByRole('button', { name: 'Mara Venn' })).toBeInTheDocument();
    expect(section).toHaveTextContent('Mara Venn, NPC in Greyford');

    rerender(<UsedBy record={{ ...record, id: 'r2', key: 'goblin' } as CompendiumRecord} />);
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'Used by' })).toBeNull());
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumRow } from '@trifold/api';
import { AddNpcPanel } from './AddNpcPanel';
import { CampaignPage, statBlockHome } from './CampaignPage';

/** Add an NPC (ADR 0037): one place for blank, another campaign's NPC, or a compendium creature. */
const row = (id: string, displayName: string, isNpc: boolean, sourceName: string) =>
  ({
    id,
    kind: 'monster',
    key: displayName.toLowerCase(),
    name: displayName,
    displayName,
    sourceId: 'srd',
    sourceName,
    edition: '2024',
    editions: ['2024'],
    otherVersions: [],
    cr: '2',
    type: 'humanoid',
    size: 'M',
    environment: null,
    isNpc,
    level: null,
    typeCode: null,
    rarity: null,
  }) as CompendiumRow;

describe('AddNpcPanel', () => {
  beforeEach(() => {
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([
      {
        campaign: { id: 'other', name: 'Pale Tower' },
        pcs: [],
        npcs: [{ id: 'vex', name: 'Captain Vex', role: 'smuggler' }],
      },
    ] as never);
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [row('r1', 'Bandit Captain', false, 'SRD 5.2'), row('r2', 'Ahmed Noke', true, 'Silt')],
      total: 2,
      tookMs: 1,
    });
  });

  const setup = (mode: 'campaigns' | 'compendium') => {
    const handlers = { onCopy: vi.fn(), onFromRecord: vi.fn(), onBack: vi.fn() };
    render(<AddNpcPanel currentCampaignId="here" mode={mode} {...handlers} />);
    return handlers;
  };

  it('copies an NPC from another campaign', async () => {
    const h = setup('campaigns');
    expect(
      screen.getByRole('heading', { name: 'Import an NPC from another campaign' }),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Copy Captain Vex from Pale Tower' }),
    );
    expect(h.onCopy).toHaveBeenCalledWith('other', 'vex');
  });

  it('says a compendium creature becomes a named NPC with its own copy, and can list only named', async () => {
    const h = setup('compendium');
    expect(screen.getByTestId('add-npc-hint')).toHaveTextContent(
      'its own copy of the stat block, kept in this campaign only',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add Ahmed Noke as an NPC' }));
    expect(h.onFromRecord).toHaveBeenCalledWith('r2', '');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Named characters only' }));
    await waitFor(() =>
      expect(window.trifold.compendium.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'monster', npc: 'only' }),
      ),
    );
  });
});

describe('AddNpcPanel paging', () => {
  it('loads the compendium a page at a time, with how many there are', async () => {
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([]);
    vi.mocked(window.trifold.compendium.search).mockImplementation(async (q) => {
      const n = Math.min(q.limit ?? 0, 250);
      return {
        rows: Array.from({ length: n }, (_, i) => row(`r${i}`, `Creature ${i}`, false, 'SRD 5.2')),
        total: 250,
        tookMs: 1,
      };
    });
    render(
      <AddNpcPanel
        currentCampaignId="here"
        mode="compendium"
        onCopy={vi.fn()}
        onFromRecord={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText('Showing 100 of 250')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Showing 200 of 250')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(screen.getAllByTestId('creature-row')).toHaveLength(250));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    // 250 rows render slowly beside the rest of the suite.
  }, 20_000);
});

describe('statBlockHome', () => {
  it('names where a stat block lives in the same words as Save', () => {
    const names = new Map([['srd', 'SRD 5.2']]);
    expect(statBlockHome('campaign:greyford', names)).toBe('This campaign');
    expect(statBlockHome('homebrew', names)).toBe('Homebrew');
    expect(statBlockHome('srd', names)).toBe('SRD 5.2');
    expect(statBlockHome('gone', names)).toBe('Compendium');
  });
});

describe('Cancel on an NPC just added from the compendium (ADR 0037)', () => {
  it('removes the NPC and its stat block copy and goes back to that search', async () => {
    const npc = {
      schemaVersion: 1,
      id: 'npc-1',
      name: 'Ahmed Noke',
      role: '',
      location: '',
      notes: '',
      isAlive: true,
      recordRef: {
        recordId: 'creature:monster:1',
        sourceId: 'campaign:here',
        key: 'ahmed noke',
        edition: '2024',
      },
      createdAt: '',
      updatedAt: '',
    };
    const bundle = {
      campaign: { id: 'here', name: 'Silt Springs', slug: 'here', settings: {} },
      pcs: [],
      encounters: [],
      adventures: [],
      notes: [],
      npcs: [],
      scenes: [],
      counters: [],
      timers: [],
      pinnedRolls: [],
    };
    vi.mocked(window.trifold.campaigns.current).mockResolvedValue(bundle as never);
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([]);
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [row('r2', 'Ahmed Noke', true, 'Silt')],
      total: 1,
      tookMs: 1,
    });
    vi.mocked(window.trifold.npcs.fromRecord).mockResolvedValue(npc as never);
    vi.mocked(window.trifold.homebrew.remove).mockResolvedValue(undefined);

    render(<CampaignPage />);
    await userEvent.click(await screen.findByRole('tab', { name: /^NPCs/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add NPC' }));
    // One plus, one menu (ADR 0037): the same on the Party tab, which has no compendium choice.
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy from the compendium…' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Find a creature' }), 'Ahmed');
    await userEvent.click(await screen.findByRole('button', { name: 'Add Ahmed Noke as an NPC' }));

    // Its form opens on it.
    const form = await screen.findByRole('form', { name: 'Edit Ahmed Noke' });
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(window.trifold.npcs.remove).toHaveBeenCalledWith('npc-1'));
    expect(window.trifold.homebrew.remove).toHaveBeenCalledWith('creature:monster:1');
    expect(
      await screen.findByRole('heading', { name: 'Copy an NPC from the compendium' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Find a creature' })).toHaveValue('Ahmed');
  });
});

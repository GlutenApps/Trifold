import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompendiumRow } from '@trifold/api';
import { AddNpcPanel } from './AddNpcPanel';
import { statBlockHome } from './CampaignPage';

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

  const setup = () => {
    const handlers = { onBlank: vi.fn(), onCopy: vi.fn(), onFromRecord: vi.fn(), onBack: vi.fn() };
    render(<AddNpcPanel currentCampaignId="here" {...handlers} />);
    return handlers;
  };

  it('starts blank, or copies an NPC from another campaign', async () => {
    const h = setup();
    expect(screen.getByRole('button', { name: 'Other campaigns' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Copy Captain Vex from Pale Tower' }),
    );
    expect(h.onCopy).toHaveBeenCalledWith('other', 'vex');
    await userEvent.click(screen.getByRole('button', { name: 'Start a blank NPC' }));
    expect(h.onBlank).toHaveBeenCalled();
  });

  it('says a compendium creature becomes a named NPC with its own copy, and can list only named', async () => {
    const h = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Compendium' }));
    expect(screen.getByTestId('add-npc-hint')).toHaveTextContent(
      'its own copy of the stat block, kept in this campaign only',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Add Ahmed Noke as an NPC' }));
    expect(h.onFromRecord).toHaveBeenCalledWith('r2');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Named characters only' }));
    await waitFor(() =>
      expect(window.trifold.compendium.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'monster', npc: 'only' }),
      ),
    );
  });
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

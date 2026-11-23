import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerPackInfo, SourceSummary } from '@trifold/api';
import { useJoinedStore } from '../../stores/joinedStore';
import { JoinCampaignPanel } from '../joined/JoinCampaignPanel';
import { ExportForPlayers } from './ExportForPlayers';

const source = (id: string, name: string, nonSrd: boolean) =>
  ({ id, name, license: { attribution: null, nonSrd } }) as SourceSummary;

describe('Export for players (ADR 0064)', () => {
  beforeEach(() => vi.mocked(window.trifold.campaigns.exportForPlayers).mockReset());

  it('puts in only what is ticked, warns for user content, and says where the file went', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.campaigns.exportForPlayers).mockResolvedValue({
      path: 'C:\\Packs\\Greyford (players).trifold-players',
      records: 12,
    });
    render(
      <ExportForPlayers
        sources={[source('S1', 'Big compendium', true), source('S2', 'Open book', false)]}
        collections={[{ id: 'K1', name: 'Core', bookKeys: [], campaignIds: [] }]}
      />,
    );
    expect(screen.queryByRole('note')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Put Big compendium in the pack' }));
    expect(screen.getByRole('note')).toHaveTextContent(
      'A pack can be passed on and never expires.',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Put Core in the pack' }));
    await user.click(screen.getByRole('button', { name: 'Export for players…' }));
    expect(window.trifold.campaigns.exportForPlayers).toHaveBeenCalledWith({
      sourceIds: ['S1'],
      collectionIds: ['K1'],
    });
    expect(await screen.findByTestId('export-players-done')).toHaveTextContent(
      'Saved 12 records to C:\\Packs\\Greyford (players).trifold-players.',
    );
  });

  it('says nothing when the save is cancelled', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.campaigns.exportForPlayers).mockResolvedValue(null);
    render(<ExportForPlayers sources={[]} collections={[]} />);
    await user.click(screen.getByRole('button', { name: 'Export for players…' }));
    await waitFor(() => expect(window.trifold.campaigns.exportForPlayers).toHaveBeenCalled());
    expect(screen.queryByTestId('export-players-done')).toBeNull();
  });
});

describe('Join a campaign from a file', () => {
  const pack: PlayerPackInfo = {
    path: 'C:\\Downloads\\Greyford (players).trifold-players',
    campaignId: 'C1',
    campaignName: 'Greyford',
    records: 3,
    createdAt: '2026-11-20T12:00:00.000Z',
    sourcesNotIncluded: ['Big compendium'],
    joined: false,
    older: false,
  };

  beforeEach(() => {
    useJoinedStore.setState({ joined: [], tables: [], searching: false });
    vi.mocked(window.trifold.joined.openPack).mockReset();
  });

  it('opens a pack, asks the name the GM will see, and joins', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.joined.choosePack).mockResolvedValue(pack);
    vi.mocked(window.trifold.joined.openPack).mockResolvedValue({
      ok: true,
      records: 3,
      campaign: {
        campaignId: 'C1',
        campaignName: 'Greyford',
        displayName: 'Sam',
        characterId: null,
        joinedAt: '2026-11-23T00:00:00.000Z',
        lastLiveAt: null,
        claimed: false,
      },
    });
    const onClose = vi.fn();
    render(<JoinCampaignPanel onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open a player pack…' }));
    const step = await screen.findByTestId('join-from-pack');
    expect(step).toHaveTextContent('Join Greyford from a file');
    expect(step).toHaveTextContent('3 records your GM shares');
    expect(screen.getByTestId('pack-not-included')).toHaveTextContent(
      'Not in the file: Big compendium.',
    );
    await user.type(screen.getByRole('textbox', { name: 'Your name at the table' }), 'Sam');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    expect(window.trifold.joined.openPack).toHaveBeenCalledWith(pack.path, 'Sam');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('will not use a pack older than what the player holds', async () => {
    const user = userEvent.setup();
    vi.mocked(window.trifold.joined.choosePack).mockResolvedValue({
      ...pack,
      joined: true,
      older: true,
    });
    render(<JoinCampaignPanel onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Open a player pack…' }));
    expect(await screen.findByTestId('join-from-pack')).toHaveTextContent(
      'Update Greyford from a file',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('You already have newer content');
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'Your name at the table' })).toBeNull();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CompendiumRow } from '@trifold/api';
import { useArtStore } from '../../stores/artStore';
import { ImagesPage } from './ImagesPage';

/** Library › Images (ADR 0033). */
const row = (key: string, name: string, type: string) =>
  ({ id: key, key, displayName: name, type, sourceName: 'SRD 5.2' }) as CompendiumRow;

describe('ImagesPage', () => {
  beforeEach(() => {
    useArtStore.setState({
      byKey: {
        'monster:owlbear': {
          kind: 'monster',
          key: 'owlbear',
          path: 'art/monster/owlbear.png',
          version: 1,
        },
      },
      error: null,
    });
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [
        row('goblin warrior', 'Goblin Warrior', 'fey'),
        row('owlbear', 'Owlbear', 'monstrosity'),
      ],
      total: 2,
      tookMs: 0,
    });
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([
      {
        campaign: { id: 'c1', name: 'Silt Springs', slug: 'silt' },
        pcs: [{ id: 'pc1', name: 'Thora', portrait: 'tokens/thora.png' }],
        npcs: [{ id: 'n1', name: 'Captain Vex' }],
      } as unknown as CampaignBundle,
    ]);
  });

  it('lists creatures, PCs and NPCs with their art, and filters to those that need it', async () => {
    render(<ImagesPage />);
    await waitFor(() => expect(screen.getAllByTestId('images-row')).toHaveLength(4));
    expect(screen.getByTestId('images-missing')).toHaveTextContent('2 still need art');
    await userEvent.click(screen.getByLabelText('Needs art'));
    expect(
      screen.getAllByTestId('images-row').map((r) => within(r).getByRole('strong').textContent),
    ).toEqual(['Captain Vex', 'Goblin Warrior']);
    await userEvent.click(screen.getByRole('button', { name: 'Add art for Goblin Warrior' }));
    expect(window.trifold.art.setCreature).toHaveBeenCalledWith(
      'monster',
      'goblin warrior',
      undefined,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add art for Captain Vex' }));
    expect(window.trifold.art.setCharacter).toHaveBeenCalledWith('c1', 'npc', 'n1');
  });

  it('adds art from a folder after showing the matches and misses', async () => {
    vi.mocked(window.trifold.art.chooseFolder).mockResolvedValue([
      { path: '/art/goblin-warrior.png', name: 'goblin-warrior' },
      { path: '/art/owlbear.png', name: 'owlbear' },
      { path: '/art/beholder.png', name: 'beholder' },
    ]);
    render(<ImagesPage />);
    await waitFor(() => expect(screen.getAllByTestId('images-row')).toHaveLength(4));
    await userEvent.click(screen.getByRole('button', { name: 'Add from folder…' }));
    const preview = screen.getByRole('group', { name: 'Add from folder' });
    expect(preview).toHaveTextContent('2 matches · 1 not matched');
    expect(preview).toHaveTextContent('has art, kept');
    // The owlbear already has art, so only the goblin is added unless the DM asks.
    await userEvent.click(within(preview).getByRole('button', { name: 'Add 1' }));
    await waitFor(() =>
      expect(window.trifold.art.setCreature).toHaveBeenCalledWith(
        'monster',
        'goblin warrior',
        '/art/goblin-warrior.png',
      ),
    );
    expect(window.trifold.art.setCreature).toHaveBeenCalledTimes(1);
  });
});

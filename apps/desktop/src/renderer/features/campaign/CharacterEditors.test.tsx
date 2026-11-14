import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CompendiumRow } from '@trifold/api';
import type { NPC, PCCard } from '@trifold/schema';
import { blankNpc, blankPc, CopyFromCampaign, NpcEditor, PcEditor } from './CharacterEditors';

const thora: PCCard = {
  ...blankPc(),
  id: 'pc1',
  name: 'Thora',
  playerName: 'Sam',
  classText: 'Fighter',
  level: 5,
  maxHp: 44,
  ac: 18,
};

const optional = (name: string) =>
  screen.getByLabelText(`${name}, optional`).closest('details') as HTMLDetailsElement;

describe('PcEditor', () => {
  it('waits for name, Max HP and AC before a new card can be saved', async () => {
    const onSave = vi.fn();
    render(<PcEditor pc={blankPc()} onSave={onSave} onCancel={() => undefined} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText('Max HP')).toHaveValue(null);
    expect(screen.getByLabelText('AC')).toHaveValue(null);

    await userEvent.type(screen.getByLabelText('Name'), 'Thora');
    await userEvent.type(screen.getByLabelText('Max HP'), '44');
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('AC'), '18');
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Thora', maxHp: 44, ac: 18, initiativeBonus: 0, speed: 30 }),
      false,
    );
  });

  it('folds every optional section on a new card and offers Save and add another', async () => {
    const onSave = vi.fn();
    render(<PcEditor pc={blankPc()} onSave={onSave} onCancel={() => undefined} />);
    for (const name of ['Basics', 'Senses', 'Combat', 'Notes']) {
      expect(optional(name).open).toBe(false);
    }
    await userEvent.type(screen.getByLabelText('Name'), 'Zed');
    await userEvent.type(screen.getByLabelText('Max HP'), '20');
    await userEvent.type(screen.getByLabelText('AC'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save and add another' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Zed' }), true);
  });

  it('opens the sections an existing card has filled, without Save and add another', () => {
    render(<PcEditor pc={thora} onSave={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Edit Thora' })).toBeInTheDocument();
    expect(optional('Basics').open).toBe(true);
    expect(optional('Senses').open).toBe(false);
    expect(optional('Notes').open).toBe(false);
    expect(screen.queryByRole('button', { name: 'Save and add another' })).toBeNull();
    expect(screen.getByLabelText('Max HP')).toHaveValue(44);
  });
});

describe('NpcEditor', () => {
  it('needs only a name, and links a stat block picked from the compendium', async () => {
    const row = {
      id: 'r1',
      kind: 'monster',
      key: 'bandit captain',
      name: 'Bandit Captain',
      displayName: 'Bandit Captain',
      sourceId: 's1',
      sourceName: 'SRD 5.1',
      edition: '2014',
      cr: '2',
    } as CompendiumRow;
    vi.mocked(window.trifold.compendium.search).mockResolvedValue({
      rows: [row],
      total: 1,
      tookMs: 0,
    });
    const onSave = vi.fn();
    render(<NpcEditor npc={blankNpc()} onSave={onSave} onCancel={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Mara Venn');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await userEvent.click(screen.getByLabelText('Stat block, optional'));
    await userEvent.type(screen.getByLabelText('Find a stat block'), 'bandit');
    await userEvent.click(await screen.findByRole('button', { name: 'Use Bandit Captain' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = onSave.mock.calls[0]![0] as NPC;
    expect(saved).toMatchObject({ name: 'Mara Venn', isAlive: true });
    expect(saved.recordRef).toEqual({
      recordId: 'r1',
      sourceId: 's1',
      key: 'bandit captain',
      edition: '2014',
    });
  });
});

describe('CopyFromCampaign', () => {
  const bundle = (id: string, name: string, pcs: PCCard[]) =>
    ({ campaign: { id, name }, pcs, npcs: [] }) as unknown as CampaignBundle;

  it('lists PCs from every other campaign and copies the one picked', async () => {
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([
      bundle('here', 'This one', [{ ...thora, id: 'mine', name: 'Already here' }]),
      bundle('c2', 'Greyford', [thora]),
    ]);
    const onCopy = vi.fn();
    render(
      <CopyFromCampaign
        kind="pc"
        currentCampaignId="here"
        onCopy={onCopy}
        onBack={() => undefined}
      />,
    );
    const rows = await screen.findAllByTestId('copy-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('Thora')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Fighter 5 · Greyford')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy Thora from Greyford' }));
    expect(onCopy).toHaveBeenCalledWith('c2', 'pc1');
  });

  it('says so when no other campaign has any', async () => {
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([bundle('here', 'Mine', [])]);
    render(
      <CopyFromCampaign
        kind="npc"
        currentCampaignId="here"
        onCopy={() => undefined}
        onBack={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('No other campaign has NPCs yet.')).toBeInTheDocument(),
    );
  });
});

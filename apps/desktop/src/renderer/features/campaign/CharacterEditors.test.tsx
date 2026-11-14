import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignBundle, CompendiumRow } from '@trifold/api';
import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord, NPC, PCCard } from '@trifold/schema';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import {
  blankNpc,
  blankPc,
  CopyFromCampaign,
  NpcEditor,
  PcEditor,
  type StatBlockEdit,
} from './CharacterEditors';

const goblin = parseCompendiumXml(fixture, {
  sourceId: 'srd',
  defaultEdition: '2014',
}).records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

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

  describe('its stat block, in the same form (ADR 0039)', () => {
    const vex: NPC = {
      ...blankNpc(),
      id: 'n1',
      name: 'Captain Vex',
      recordRef: {
        recordId: goblin.id,
        sourceId: goblin.sourceId,
        key: goblin.key,
        edition: '2024',
      },
    };
    const setup = (inPlace: boolean) => {
      vi.mocked(window.trifold.compendium.get).mockResolvedValue(goblin);
      const onSave = vi.fn();
      render(<NpcEditor npc={vex} inPlace={inPlace} onSave={onSave} onCancel={() => undefined} />);
      return onSave;
    };

    it('shows the stat block below the NPC and hands it up only when it changed', async () => {
      const onSave = setup(true);
      const editor = await screen.findByTestId('npc-statblock-editor');
      expect(within(editor).getByLabelText('Stat block name')).toHaveValue(goblin.displayName);
      expect(screen.getByTestId('statblock-home-note')).toHaveTextContent('update this NPC');

      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSave.mock.calls[0]![2]).toBeNull();

      // Scale it: the scaler sits at the top of the stat block's Challenge section.
      await userEvent.click(within(editor).getByRole('button', { name: 'One CR higher' }));
      await userEvent.click(within(editor).getByRole('button', { name: /^Apply CR/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
      const edit = onSave.mock.calls[1]![2] as StatBlockEdit;
      expect(edit.inPlace).toBe(true);
      expect(edit.original.id).toBe(goblin.id);
      expect(edit.edited.data.cr).toBe('1/2');
      expect(onSave.mock.calls[1]![0]).toMatchObject({ name: 'Captain Vex' });
    });

    it('says a shared stat block is copied, and asks before unlinking over changes', async () => {
      setup(false);
      const editor = await screen.findByTestId('npc-statblock-editor');
      expect(screen.getByTestId('statblock-home-note')).toHaveTextContent('make a copy');

      await userEvent.clear(within(editor).getByLabelText('Hit points'));
      await userEvent.type(within(editor).getByLabelText('Hit points'), '40');
      await userEvent.click(screen.getByRole('button', { name: 'Unlink stat block' }));
      expect(screen.getByText('Unlink this stat block and drop your changes to it?')).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
      expect(screen.getByTestId('npc-statblock-editor')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Unlink stat block' }));
      await userEvent.click(screen.getByRole('button', { name: 'Unlink' }));
      await waitFor(() => expect(screen.queryByTestId('npc-statblock-editor')).toBeNull());
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

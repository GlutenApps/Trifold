import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCompendiumXml } from '@trifold/importers';
import type { CampaignBundle } from '@trifold/api';
import type { CompendiumRecord, MonsterRecord } from '@trifold/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { CreatureEditor } from './CreatureEditor';

const { records } = parseCompendiumXml(fixture, { sourceId: 'srd', defaultEdition: '2024' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;
// The unsaved copy an Edit opens on, as homebrew.draft makes it.
const copy = { ...goblin, id: 'homebrew:monster:draft', sourceId: 'homebrew' } as CompendiumRecord;
const original = {
  identity: { id: goblin.id, sourceId: goblin.sourceId, key: goblin.key },
  name: goblin.displayName,
};

describe('CreatureEditor', () => {
  beforeEach(() => {
    useCombatStore.setState({ encounterId: null, state: null });
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1', name: 'Greyford', slug: 'greyford', settings: {} },
        encounters: [],
        scenes: [],
        pcs: [],
        npcs: [],
      } as unknown as CampaignBundle,
    });
    vi.mocked(window.trifold.homebrew.save).mockImplementation(async (r) => r);
    vi.mocked(window.trifold.compendium.findByKey).mockResolvedValue([]);
  });

  const open = (onSaved = vi.fn()) => {
    render(
      <CreatureEditor
        record={copy}
        own={false}
        original={original}
        origin={{ kind: 'record' }}
        title="Edit Goblin Warrior"
        onCancel={() => undefined}
        onSaved={onSaved}
      />,
    );
    return onSaved;
  };

  it('writes nothing on Save; the step asks where it lives, defaulting to this campaign', async () => {
    const onSaved = open();
    expect(screen.getByRole('heading', { name: 'Edit Goblin Warrior' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(window.trifold.homebrew.save).not.toHaveBeenCalled();

    const step = screen.getByLabelText('Save');
    expect(within(step).getByRole('radio', { name: /In Greyford/ })).toBeChecked();
    // The campaign uses no Goblin Warrior, so there is nowhere else to use it.
    expect(within(step).getByRole('radio', { name: 'Nowhere yet' })).toBeChecked();
    expect(within(step).queryByRole('radio', { name: /Every/ })).toBeNull();

    await userEvent.click(within(step).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const written = vi.mocked(window.trifold.homebrew.save).mock.calls[0]![0];
    expect(written.sourceId).toBe('campaign:greyford');
    expect(written.id).toMatch(/^creature:monster:/);
  });

  it('Back returns to the form, and a taken compendium name blocks Confirm with a free one offered', async () => {
    vi.mocked(window.trifold.compendium.findByKey).mockImplementation(async (_kind, key) =>
      key === 'goblin warrior' ? [goblin] : [],
    );
    const onSaved = open();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const step = screen.getByLabelText('Save');
    await userEvent.click(within(step).getByRole('radio', { name: /In my compendium/ }));
    const warning = await within(step).findByRole('alert');
    expect(warning).toHaveTextContent('is already in');
    expect(within(step).getByRole('button', { name: 'Confirm' })).toBeDisabled();

    await userEvent.click(within(warning).getByRole('button', { name: /Use “Goblin Warrior 2”/ }));
    await waitFor(() => expect(within(step).queryByRole('alert')).toBeNull());
    await userEvent.click(within(step).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const written = vi.mocked(window.trifold.homebrew.save).mock.calls[0]![0];
    expect(written).toMatchObject({ sourceId: 'homebrew', displayName: 'Goblin Warrior 2' });
  });
});

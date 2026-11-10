import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBundle } from '@trifold/api';
import type { Encounter } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { EncountersPage } from './EncountersPage';

const now = '2026-09-28T00:00:00.000Z';

function encounter(id: string, name: string): Encounter {
  return {
    schemaVersion: 1,
    id,
    name,
    combatants: [
      {
        id: `${id}-t`,
        ref: { kind: 'custom', name: 'Bandit' },
        quantity: 2,
        role: 'enemy',
        hidden: false,
      },
    ],
    notes: '',
    state: null,
    results: [],
    createdAt: now,
    updatedAt: now,
  };
}

function bundle(): CampaignBundle {
  return {
    campaign: {
      schemaVersion: 1,
      id: 'c1',
      slug: 'sunken-keep',
      name: 'Sunken Keep',
      preferredEdition: '2024',
      settings: { initiativeMode: 'perGroup' },
      createdAt: now,
      updatedAt: now,
    },
    pcs: [],
    adventures: [],
    notes: [],
    npcs: [],
    encounters: [encounter('e1', 'Bridge ambush'), encounter('e2', 'Crypt guards')],
    scenes: [],
    counters: [],
    timers: [],
  } as unknown as CampaignBundle;
}

describe('EncountersPage', () => {
  beforeEach(() => {
    useCampaignStore.setState({ current: bundle() });
    useCombatStore.setState({ encounterId: null, state: null, browsing: false, finished: null });
  });

  it('becomes the tracker while a fight runs, with the list a click away', async () => {
    render(<EncountersPage />);
    expect(screen.getByRole('button', { name: 'Start combat: Bridge ambush' })).toBeEnabled();

    act(() =>
      useCombatStore.setState({
        encounterId: 'e1',
        state: { round: 2, turnIndex: -1, combatants: [], log: [], startedAt: now },
      }),
    );
    expect(screen.queryByTestId('encounter-row')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End combat' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to encounters' }));
    expect(screen.getByRole('status')).toHaveTextContent('Bridge ambush is running · round 2');
    expect(screen.getAllByTestId('encounter-row')).toHaveLength(2);
    // One fight at a time: the others wait, and the running one cannot be removed.
    expect(screen.getByRole('button', { name: 'Start combat: Crypt guards' })).toBeDisabled();
    // Its actions keep their places (Play, Edit, Delete; ADR 0020), disabled where they do not apply.
    const running = screen.getAllByTestId('encounter-row')[0]!;
    expect(
      within(running)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Return to fight: Bridge ambush', 'Edit Bridge ambush', 'Delete Bridge ambush']);
    expect(screen.getByRole('button', { name: 'Delete Bridge ambush' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Return to fight: Bridge ambush' }));
    expect(screen.getByRole('button', { name: 'End combat' })).toBeInTheDocument();
  });

  it('shows the finished fight once, then the list', async () => {
    act(() =>
      useCombatStore.setState({
        finished: {
          encounterId: 'e1',
          result: { endedAt: now, rounds: 4, xpEarned: 200, casualties: ['Thora'], log: [] },
        },
      }),
    );
    render(<EncountersPage />);
    const result = screen.getByTestId('fight-result');
    expect(result).toHaveTextContent('Bridge ambush finished');
    expect(result).toHaveTextContent('4 rounds · 200 XP · fallen: Thora');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss result' }));
    expect(screen.queryByTestId('fight-result')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('encounter-row')).toHaveLength(2);
  });
});

describe('EncountersPage: named NPCs (ADR 0012)', () => {
  beforeEach(() => {
    const b = bundle();
    const bandits = b.encounters[0]!.combatants[0]!;
    bandits.cache = { xp: 25, cr: '1/8', type: 'humanoid', hp: 11, ac: 12 };
    useCampaignStore.setState({ current: b });
    useCombatStore.setState({ encounterId: null, state: null, browsing: false, finished: null });
  });

  it('splits one creature out of a group as an NPC, and offers NPCs not yet in it', async () => {
    render(<EncountersPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Bridge ambush' }));
    expect(screen.getAllByTestId('template-row')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Track Bandit as NPC' }));
    await waitFor(() => expect(screen.getAllByTestId('template-row')).toHaveLength(2));
    expect(window.trifold.npcs.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bandit',
        isAlive: true,
        hp: { current: 11, max: 11, temp: 0 },
      }),
    );
    const rows = screen.getAllByTestId('template-row');
    expect(rows[0]).toHaveTextContent('Bandit');
    expect(rows[1]).toHaveTextContent('NPC');
    // An NPC already in the encounter is not offered again; removing it offers it back.
    expect(screen.queryByRole('button', { name: 'Add Bandit' })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove Bandit' })[1]!);
    expect(screen.getByRole('button', { name: 'Add Bandit' })).toBeInTheDocument();
  });
});

describe('EncountersPage: builder autosave (ADR 0015)', () => {
  beforeEach(() => {
    useCampaignStore.setState({ current: bundle() });
    useCombatStore.setState({ encounterId: null, state: null, browsing: false, finished: null });
    vi.mocked(window.trifold.encounters.save).mockClear();
  });

  const renameBridge = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Edit Bridge ambush' }));
    const name = screen.getByLabelText('Encounter name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bridge toll');
  };

  it('lets the last edit land when the DM goes back straight away', async () => {
    render(<EncountersPage />);
    await renameBridge();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await waitFor(() =>
      expect(window.trifold.encounters.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', name: 'Bridge toll' }),
      ),
    );
  });

  it('lets the last edit land when the DM switches to another encounter', async () => {
    render(<EncountersPage />);
    await renameBridge();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Crypt guards' }));
    await waitFor(() =>
      expect(window.trifold.encounters.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'e1', name: 'Bridge toll' }),
      ),
    );
  });

  it('never writes back an encounter deleted while its edit waits', async () => {
    render(<EncountersPage />);
    await renameBridge();
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Bridge ambush' }));
    await userEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(window.trifold.encounters.remove).toHaveBeenCalledWith('e1'));
    await new Promise((done) => setTimeout(done, 600));
    expect(window.trifold.encounters.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', name: 'Bridge toll' }),
    );
  });
});

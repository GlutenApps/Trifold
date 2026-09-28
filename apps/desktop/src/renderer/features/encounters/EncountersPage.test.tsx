import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
    expect(screen.queryByRole('button', { name: 'Remove Bridge ambush' })).not.toBeInTheDocument();

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
    await userEvent.click(screen.getByRole('button', { name: 'Export combat log' }));
    expect(window.trifold.app.saveTextFile).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Export combat log' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss result' }));
    expect(screen.queryByTestId('fight-result')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('encounter-row')).toHaveLength(2);
  });
});

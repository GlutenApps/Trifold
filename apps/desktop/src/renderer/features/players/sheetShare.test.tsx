import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { PCCard, PlayerSheet } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { blankPc } from '../campaign/CharacterEditors';
import { CampaignPage } from '../campaign/CampaignPage';
import { applyTableSheetShare } from './sheetOffer';

/** A player's sheet on the GM's side (ADR 0078): kept on the PC card, read-only. */

const now = '2026-11-24T00:00:00.000Z';
const brannoc: PCCard = {
  ...blankPc(),
  id: 'brannoc',
  name: 'Brannoc Hale',
  maxHp: 31,
  ac: 16,
  createdAt: now,
  updatedAt: now,
};
const sheet: PlayerSheet = {
  schemaVersion: 1,
  id: 'K1',
  name: 'Brannoc Hale',
  kind: 'trifold',
  edition: '2024',
  numbers: {
    classText: '',
    level: 1,
    maxHp: 10,
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    passives: { perception: 10, insight: 10, investigation: 10 },
    saves: {},
  },
  sheet: {
    ...blankSheet(),
    classes: [{ name: 'Fighter', subclass: '', level: 5 }],
    attacks: [
      { id: 'a', name: 'Longsword', ability: 'str', proficient: true, bonus: 0, damage: '1d8+3' },
    ],
  },
  createdAt: now,
  updatedAt: now,
};

describe('keeping a shared sheet on the PC card', () => {
  const savePc = vi.fn(async (pc: PCCard) => pc);
  beforeEach(() => {
    savePc.mockClear();
    useCampaignStore.setState({
      current: { campaign: { id: 'c1' }, pcs: [brannoc], scenes: [] } as never,
      savePc: savePc as never,
    });
  });

  it('keeps the sheet with who shared it, changing nothing else on the card', async () => {
    await applyTableSheetShare({ deviceLabel: 'Sam', pcId: 'brannoc', character: sheet });
    const saved = savePc.mock.calls[0]![0];
    expect(saved).toMatchObject({
      name: 'Brannoc Hale',
      maxHp: 31,
      ac: 16,
      playerSheet: { character: sheet, from: 'Sam' },
    });
    expect(Date.parse(saved.playerSheet!.sharedAt)).not.toBeNaN();
  });

  it('takes it off when the player unlinks, and ignores a card that is gone', async () => {
    useCampaignStore.setState({
      current: {
        campaign: { id: 'c1' },
        pcs: [{ ...brannoc, playerSheet: { character: sheet, from: 'Sam', sharedAt: now } }],
        scenes: [],
      } as never,
    });
    await applyTableSheetShare({ deviceLabel: 'Sam', pcId: 'brannoc', character: null });
    expect(savePc.mock.calls[0]![0]).not.toHaveProperty('playerSheet');
    savePc.mockClear();
    await applyTableSheetShare({ deviceLabel: 'Sam', pcId: 'gone', character: sheet });
    expect(savePc).not.toHaveBeenCalled();
  });
});

describe('reading a player’s sheet on the Party tab', () => {
  it('opens it read-only from the row, and offers nothing for a card without one', async () => {
    const bundle = {
      campaign: { id: 'here', name: 'Silt Springs', slug: 'here', settings: {} },
      pcs: [
        { ...brannoc, playerSheet: { character: sheet, from: 'Sam', sharedAt: now } },
        { ...brannoc, id: 'mira', name: 'Mira Fenn' },
      ],
      encounters: [],
      adventures: [],
      notes: [],
      npcs: [],
      scenes: [],
      counters: [],
      timers: [],
      pinnedRolls: [],
      sessions: [],
    };
    vi.mocked(window.trifold.campaigns.current).mockResolvedValue(bundle as never);
    vi.mocked(window.trifold.campaigns.bundles).mockResolvedValue([]);
    await useCampaignStore.getState().load();
    const user = userEvent.setup();
    render(<CampaignPage />);

    await waitFor(() => expect(screen.getAllByTestId('pc-row')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Read Mira Fenn’s sheet' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Read Brannoc Hale’s sheet' }));
    const view = screen.getByTestId('player-sheet');
    expect(view).toHaveTextContent('Shared from Sam’s Trifold');
    expect(within(view).getByTestId('sheet-view')).toHaveTextContent('Fighter 5');
    expect(within(view).getByLabelText('Attacks')).toHaveTextContent('Longsword');
    // Read-only: nothing to edit, and no rolls.
    expect(within(view).queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(within(view).queryByRole('button', { name: /^Roll / })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to the party' }));
    expect(screen.queryByTestId('player-sheet')).toBeNull();
  });
});

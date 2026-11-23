import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetOffer, TableStatus } from '@trifold/api';
import { TableNumbers, type PCCard } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useTableStore } from '../../stores/tableStore';
import { TABLE_OFF } from '../../test/setup';
import { blankPc } from '../campaign/CharacterEditors';
import { PlayerDevicesPop } from './PlayerDevices';
import { applyTableSheet, sheetChanges, withSheetOffer } from './sheetOffer';

const brannoc: PCCard = {
  ...blankPc(),
  id: 'brannoc',
  name: 'Brannoc Hale',
  classText: 'Fighter',
  level: 4,
  maxHp: 31,
  currentHp: 30,
  ac: 16,
  spellSaveDc: 12,
  conditions: [{ id: 'x', name: 'Prone', appliedRound: 0 }],
  createdAt: '2026-11-23T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
};

const levelUp: SheetOffer = {
  name: 'Brannoc Hale',
  numbers: TableNumbers.parse({
    classText: 'Fighter',
    level: 5,
    maxHp: 24,
    ac: 16,
    initiativeBonus: 1,
    saves: { str: 6 },
  }),
  sheetUrl: 'https://example.test/brannoc',
};

describe('sheet updates on the GM’s side (ADR 0071)', () => {
  it('lists what accepting would change on the card', () => {
    expect(sheetChanges(brannoc, levelUp)).toEqual([
      'Level 4 → 5',
      'Max HP 31 → 24',
      'Initiative +0 → +1',
      'STR save — → +6',
      'Spell save DC 12 → —',
      'A new character sheet link',
    ]);
    expect(sheetChanges(withSheetOffer(brannoc, levelUp), levelUp)).toEqual([]);
  });

  it('writes the numbers and leaves play state alone, current HP held under the new maximum', () => {
    const next = withSheetOffer(brannoc, levelUp);
    expect(next).toMatchObject({
      name: 'Brannoc Hale',
      level: 5,
      maxHp: 24,
      currentHp: 24,
      sheetUrl: 'https://example.test/brannoc',
      conditions: brannoc.conditions,
    });
    expect(next).not.toHaveProperty('spellSaveDc');
    // A card at full HP stays full: no current HP is invented.
    const { currentHp: _hp, ...full } = brannoc;
    expect(withSheetOffer(full, levelUp)).not.toHaveProperty('currentHp');
  });

  it('applies an accepted offer through the campaign store', () => {
    const savePc = vi.fn(async (pc: PCCard) => pc);
    useCampaignStore.setState({
      current: { campaign: { id: 'c1' }, pcs: [brannoc], scenes: [] } as never,
      savePc: savePc as never,
    });
    applyTableSheet({ deviceLabel: 'Sam', pcId: 'brannoc', offer: levelUp });
    expect(savePc).toHaveBeenCalledWith(expect.objectContaining({ id: 'brannoc', level: 5 }));
    savePc.mockClear();
    applyTableSheet({ deviceLabel: 'Sam', pcId: 'gone', offer: levelUp });
    expect(savePc).not.toHaveBeenCalled();
  });
});

describe('New PC from player sheet (ADR 0072)', () => {
  it('makes a card from the offer and hands it to the player who asked', async () => {
    const savePc = vi.fn(async (pc: PCCard) => ({ ...pc, id: 'new-pc' }));
    useCampaignStore.setState({
      current: { campaign: { id: 'c1' }, pcs: [], scenes: [] } as never,
      savePc: savePc as never,
    });
    await applyTableSheet({ deviceLabel: 'Sam', pcId: null, offer: levelUp, requestId: 'r9' });
    expect(savePc).toHaveBeenCalledWith(
      expect.objectContaining({ id: '', name: 'Brannoc Hale', level: 5, maxHp: 24 }),
    );
    expect(window.trifold.table.grantNewPc).toHaveBeenCalledWith('r9', 'new-pc');
  });
});

describe('sheet updates in the Player devices pop-up (ADR 0071)', () => {
  const ON: TableStatus = {
    ...TABLE_OFF,
    state: 'on',
    campaignId: 'c1',
    port: 8130,
    urls: ['http://192.168.1.23:8130'],
    startedAt: new Date().toISOString(),
    anyConnected: true,
    sheetOffers: [
      {
        requestId: 'r1',
        label: 'Sam',
        pcId: 'brannoc',
        creatureName: 'Brannoc Hale',
        offer: levelUp,
      },
    ],
    sheets: { autoAccept: false },
  };

  beforeEach(() => {
    useCampaignStore.setState({
      current: {
        campaign: {
          id: 'c1',
          slug: 'g',
          name: 'Greyford',
          settings: { tokenStyle: 'engraved', summonable: [] },
        },
        pcs: [brannoc],
        npcs: [],
        scenes: [],
        encounters: [],
        notes: [],
        adventures: [],
        counters: [],
        timers: [],
        pinnedRolls: [],
        sessions: [],
      } as never,
    });
    useTableStore.setState({ status: ON, joinOnTv: false, error: null });
    vi.mocked(window.trifold.table.answerSheet).mockResolvedValue(ON);
    vi.mocked(window.trifold.table.setSheetAutoAccept).mockResolvedValue(ON);
  });

  it('shows the update with what would change, puts the dot on the button, and answers it', async () => {
    render(<PlayerDevicesPop open onToggle={() => undefined} onClose={() => undefined} />);
    expect(screen.getByTestId('devices-waiting')).toBeInTheDocument();
    const offer = screen.getByTestId('sheet-offer');
    expect(offer).toHaveTextContent('Sam offers new numbers for Brannoc Hale');
    expect(offer).toHaveTextContent('Level 4 → 5 · Max HP 31 → 24');
    await act(async () => {
      fireEvent.click(
        within(offer).getByRole('button', { name: 'Accept Brannoc Hale’s new numbers' }),
      );
    });
    expect(window.trifold.table.answerSheet).toHaveBeenCalledWith('r1', true);
    await act(async () => {
      fireEvent.click(
        within(offer).getByRole('button', { name: 'Dismiss Brannoc Hale’s new numbers' }),
      );
    });
    expect(window.trifold.table.answerSheet).toHaveBeenCalledWith('r1', false);
  });

  it('asks before adding a new PC from a player’s sheet', async () => {
    useTableStore.setState({
      status: {
        ...ON,
        sheetOffers: [
          {
            requestId: 'r2',
            label: 'Wren’s laptop',
            pcId: null,
            creatureName: 'Wren',
            offer: { ...levelUp, name: 'Wren' },
          },
        ],
      },
    });
    render(<PlayerDevicesPop open onToggle={() => undefined} onClose={() => undefined} />);
    const offer = screen.getByTestId('sheet-offer');
    expect(offer).toHaveTextContent('Wren’s laptop asks to add Wren as a new PC');
    expect(offer).toHaveTextContent('Fighter · AC 16 · 24 HP');
    await act(async () => {
      fireEvent.click(within(offer).getByRole('button', { name: 'Add Wren as a PC' }));
    });
    expect(window.trifold.table.answerSheet).toHaveBeenCalledWith('r2', true);
  });

  it('turns on Accept sheet updates automatically', async () => {
    render(<PlayerDevicesPop open onToggle={() => undefined} onClose={() => undefined} />);
    const box = screen.getByRole('checkbox', { name: 'Accept sheet updates automatically' });
    expect(box).not.toBeChecked();
    await act(async () => {
      fireEvent.click(box);
    });
    expect(window.trifold.table.setSheetAutoAccept).toHaveBeenCalledWith(true);
  });
});

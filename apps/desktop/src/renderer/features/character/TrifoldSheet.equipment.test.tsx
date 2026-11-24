import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Character } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { TrifoldSheet } from './TrifoldSheet';

/** Editing coins, defences, senses and where items are kept (docs/CHARACTER-SHEET.md). */

const now = '2026-11-24T00:00:00.000Z';
const character: Character = {
  schemaVersion: 1,
  id: 'K5',
  name: 'Tamsin',
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
  sheet: { ...blankSheet(), equipment: [{ id: 'i1', name: 'Wand', quantity: 1 }] },
  notes: '',
  createdAt: now,
  updatedAt: now,
};

const sheet = () => useCharacterStore.getState().characters[0]!.sheet!;

/** The editor, re-rendered from the store as the page does. */
function Editor() {
  const current = useCharacterStore((s) => s.characters[0]!);
  return <TrifoldSheet character={current} />;
}

beforeEach(() => {
  useCharacterStore.setState({ characters: [character], openId: 'K5' });
});

describe('the sheet editor', () => {
  it('keeps each coin apart from gold', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.type(screen.getByRole('spinbutton', { name: 'Silver (SP)' }), '12');
    await user.type(screen.getByRole('spinbutton', { name: 'Platinum (PP)' }), '3');
    expect(sheet().coins).toEqual({ cp: 0, sp: 12, ep: 0, pp: 3 });
    expect(sheet().gp).toBe(0);
  });

  it('takes defences as a list typed with commas, and senses and speeds in feet', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    const resist = screen.getByRole('textbox', { name: 'Resistant to' });
    await user.type(resist, 'fire, poison, ');
    // The trailing comma stays while typing; the list is what it means.
    expect(resist).toHaveValue('fire, poison, ');
    expect(sheet().defenses?.resist).toEqual(['fire', 'poison']);
    await user.type(screen.getByRole('spinbutton', { name: 'Darkvision' }), '60');
    await user.type(screen.getByRole('spinbutton', { name: 'Swim speed' }), '30');
    expect(sheet().senses).toEqual({ darkvision: 60 });
    expect(sheet().speeds).toEqual({ swim: 30 });
  });

  it('says where an item is kept, and gives it charges that come back at dawn', async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.type(screen.getByRole('combobox', { name: 'Wand place' }), 'Backpack');
    expect(sheet().equipment[0]!.place).toBe('Backpack');
    await user.type(screen.getByRole('spinbutton', { name: 'Wand charges' }), '7');
    expect(sheet().equipment[0]!.uses).toEqual({ max: 7, used: 0, reset: 'dawn' });
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Wand charges come back' }),
      'short',
    );
    expect(sheet().equipment[0]!.uses?.reset).toBe('short');
    // Charges show among the resources too.
    expect(screen.getByRole('group', { name: 'Wand charge: 7 of 7 left' })).toBeInTheDocument();
  });
});

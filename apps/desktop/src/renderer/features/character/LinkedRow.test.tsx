import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Character, CompendiumRecord } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { SheetView } from './SheetView';
import { TrifoldSheet } from './TrifoldSheet';

/** A sheet's rows linked to compendium records open to show the record's text (ADR 0073). */

const fireBolt = {
  schemaVersion: 1,
  id: 'r1',
  kind: 'spell',
  key: 'fire bolt',
  name: 'Fire Bolt',
  displayName: 'Fire Bolt',
  sourceId: 'srd-2024',
  edition: '2024',
  tags: [],
  data: {
    level: 0,
    school: 'V',
    time: '1 action',
    range: '120 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    classes: ['Wizard'],
    text: 'You hurl a mote of fire at a creature or an object within range.',
    rolls: [],
    extra: {},
  },
} as unknown as CompendiumRecord;

const character: Character = {
  schemaVersion: 1,
  id: 'K1',
  name: 'Orrin',
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
    spells: [
      {
        id: 's1',
        name: 'Fire Bolt',
        level: 0,
        prepared: false,
        ref: { kind: 'spell', key: 'fire bolt', name: 'Fire Bolt' },
      },
      { id: 's2', name: 'Quick Clothier', level: 1, prepared: true },
    ],
    equipment: [
      {
        id: 'i1',
        name: 'Bag of Holding',
        quantity: 1,
        ref: { kind: 'item', key: 'bag of holding', name: 'Bag of Holding' },
      },
    ],
  },
  notes: '',
  createdAt: '2026-11-23T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(window.trifold.compendium.findByKey).mockReset();
  vi.mocked(window.trifold.compendium.findByKey).mockImplementation(async (kind, key) =>
    kind === 'spell' && key === 'fire bolt' ? [fireBolt] : [],
  );
});

describe('linked rows on a sheet', () => {
  it('shows the record’s text only when the row is opened', async () => {
    const user = userEvent.setup();
    render(<SheetView character={character} />);
    // Linked records are read for the row's marks (concentration, attunement); the text itself
    // shows only once the row is opened.
    expect(screen.queryByTestId('linked-record')).toBeNull();
    await user.click(screen.getByText('Fire Bolt'));
    expect(await screen.findByTestId('linked-record')).toHaveTextContent('You hurl a mote of fire');
    expect(window.trifold.compendium.findByKey).toHaveBeenCalledWith('spell', 'fire bolt');
  });

  it('says so when the record is not in the compendium now', async () => {
    const user = userEvent.setup();
    render(<SheetView character={character} />);
    await user.click(screen.getByText('Bag of Holding'));
    expect(await screen.findByTestId('linked-missing')).toHaveTextContent(
      'Bag of Holding is not in your compendium now.',
    );
  });

  it('leaves a row without a link as plain text', () => {
    render(<SheetView character={character} />);
    expect(screen.getByText('Quick Clothier').closest('details')).toBeNull();
  });
});

describe('linked rows on the sheet being edited', () => {
  it('shows the text under the row from its Read button', async () => {
    useCharacterStore.setState({ characters: [character], openId: 'K1' });
    const user = userEvent.setup();
    render(<TrifoldSheet character={character} />);
    expect(screen.queryByRole('button', { name: 'Read Quick Clothier' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Read Fire Bolt' }));
    expect(await screen.findByTestId('linked-record')).toHaveTextContent('You hurl a mote of fire');
    await user.click(screen.getByRole('button', { name: 'Read Fire Bolt' }));
    expect(screen.queryByTestId('linked-record')).toBeNull();
  });

  it('drops the link when the row is renamed to something else', async () => {
    useCharacterStore.setState({ characters: [character], openId: 'K1' });
    const user = userEvent.setup();
    render(<TrifoldSheet character={character} />);
    const name = screen.getByRole('textbox', { name: 'Spell 1 name' });
    await user.type(name, 's');
    expect(useCharacterStore.getState().characters[0]!.sheet!.spells[0]!.ref).toBeUndefined();
  });
});

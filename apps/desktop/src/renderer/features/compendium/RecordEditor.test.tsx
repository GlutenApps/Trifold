import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  CompendiumRecord,
  type ClassRecord,
  type ItemRecord,
  type RecordKind,
  type SpellRecord,
} from '@trifold/schema';
import { blankRecord } from './homebrew';
import { HomebrewEditor } from './RecordEditor';

/** Homebrew for every kind (ADR 0026): blank records are valid, each kind has an editor. */

const KINDS: RecordKind[] = [
  'monster',
  'spell',
  'item',
  'feat',
  'species',
  'background',
  'class',
  'condition',
];

function renderEditor(record: CompendiumRecord, isNew = true) {
  const onSave = vi.fn();
  render(
    <HomebrewEditor
      record={record}
      isNew={isNew}
      saving={false}
      onSave={onSave}
      onCancel={() => undefined}
    />,
  );
  return { onSave };
}

describe('blankRecord', () => {
  it.each(KINDS)('makes a %s that the schema accepts, in the homebrew source', (kind) => {
    const record = blankRecord(kind);
    expect(() => CompendiumRecord.parse({ ...record, name: 'X', displayName: 'X' })).not.toThrow();
    expect(record).toMatchObject({ kind, sourceId: 'homebrew', edition: '2024' });
    expect(record.id).toMatch(new RegExp(`^homebrew:${kind}:`));
  });

  it('gives each blank record its own id', () => {
    expect(blankRecord('spell').id).not.toBe(blankRecord('spell').id);
  });
});

describe('HomebrewEditor', () => {
  it.each(KINDS)('opens an editor for a new %s that waits for a name', (kind) => {
    renderEditor(blankRecord(kind));
    expect(screen.getByRole('heading', { name: `New homebrew ${kind}` })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled();
  });

  it('saves a spell with its fields and a roll, and holds Save while a roll is not dice', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor(blankRecord('spell'));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Frost Lance');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Level' }), '2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'School' }), 'EV');
    await user.type(screen.getByRole('textbox', { name: 'Classes' }), 'Wizard, Sorcerer');
    await user.type(screen.getByRole('textbox', { name: 'Text' }), 'A lance of ice.');

    await user.click(screen.getByRole('button', { name: 'Add roll' }));
    const dice = screen.getByRole('textbox', { name: 'Roll dice' });
    await user.clear(dice);
    await user.type(dice, 'lots');
    expect(screen.getByText('Not dice')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled();
    await user.clear(dice);
    await user.type(dice, '3d8');
    await user.type(screen.getByRole('textbox', { name: 'Roll label' }), 'Cold damage');

    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    const saved = onSave.mock.calls[0]![0] as SpellRecord;
    expect(saved).toMatchObject({ name: 'Frost Lance', displayName: 'Frost Lance' });
    expect(saved.data).toMatchObject({
      level: 2,
      school: 'EV',
      classes: ['Wizard', 'Sorcerer'],
      text: 'A lance of ice.',
      rolls: [{ dice: '3d8', description: 'Cold damage' }],
    });
    expect(() => CompendiumRecord.parse(saved)).not.toThrow();
  });

  it('edits an item’s type, rarity and damage, and drops an emptied optional field', async () => {
    const user = userEvent.setup();
    const base = blankRecord('item') as ItemRecord;
    const { onSave } = renderEditor(
      { ...base, name: 'Old', displayName: 'Old', data: { ...base.data, detail: 'gone soon' } },
      false,
    );
    expect(screen.getByRole('heading', { name: 'Edit homebrew item' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'M');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rarity' }), 'Rare');
    await user.type(screen.getByRole('textbox', { name: 'Damage' }), '1d8');
    await user.clear(screen.getByRole('textbox', { name: 'Detail' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    const saved = onSave.mock.calls[0]![0] as ItemRecord;
    expect(saved.data).toMatchObject({ typeCode: 'M', rarity: 'Rare', dmg1: '1d8' });
    expect(saved.data.detail).toBeUndefined();
  });

  it('builds a class level by level with features and spell slots', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor(blankRecord('class'));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Warden');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Hit die' }), '10');
    await user.click(screen.getByRole('button', { name: 'Add level 1' }));
    await user.click(screen.getByRole('button', { name: 'Add level 2' }));
    const [one, two] = screen.getAllByTestId('class-level');
    await user.click(within(one!).getByRole('button', { name: 'Add feature' }));
    await user.type(within(one!).getByRole('textbox', { name: 'Feature name' }), 'Oath');
    await user.type(within(one!).getByRole('textbox', { name: 'Feature text' }), 'You swear.');
    const slots = within(two!).getByRole('textbox', { name: 'Level 2 spell slots' });
    await user.type(slots, '0, 2');
    fireEvent.blur(slots);
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    const saved = onSave.mock.calls[0]![0] as ClassRecord;
    expect(saved.data.hd).toBe(10);
    expect(saved.data.levels).toMatchObject([
      { level: 1, features: [{ name: 'Oath', text: 'You swear.', optional: false }] },
      { level: 2, features: [], slots: { values: [0, 2] } },
    ]);
    expect(() => CompendiumRecord.parse(saved)).not.toThrow();
  });

  it('gives species traits a list with Add and Remove', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor(blankRecord('species'));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Mossfolk');
    await user.click(screen.getByRole('button', { name: 'Add trait' }));
    await user.type(screen.getByRole('textbox', { name: 'Trait name' }), 'Rooted');
    await user.click(screen.getByRole('button', { name: 'Add trait' }));
    await user.click(screen.getByRole('button', { name: 'Remove Trait 2' }));
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    expect(onSave.mock.calls[0]![0].data.traits).toMatchObject([{ name: 'Rooted' }]);
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfSheetPreview } from '@trifold/api';
import { blankSheet } from '@trifold/rules';
import type { Character } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { CharactersPage } from './CharactersPage';
import { TrifoldSheet } from './TrifoldSheet';

/** Import from PDF (ADR 0073): read, preview, then create or replace; nothing written before. */

const sheet = {
  ...blankSheet(),
  classes: [{ name: 'Wizard', subclass: '', level: 3 }],
  species: 'Dwarf',
  background: 'Sage',
  abilities: { str: 10, dex: 14, con: 14, int: 17, wis: 12, cha: 8 },
  maxHp: 20,
  overrides: { ac: 15 },
};
const preview: PdfSheetPreview = {
  fileName: 'orrin.pdf',
  name: 'Orrin Vale',
  edition: '2014',
  sheet,
  notes: 'Backstory: Raised in a mountain library.',
  warnings: ['No hit point maximum on the sheet; set it on the sheet.'],
};

const lastSaved = () =>
  vi.mocked(window.trifold.characters.save).mock.calls.at(-1)?.[0] as Character;

beforeEach(() => {
  useCharacterStore.setState({
    characters: [],
    loaded: false,
    openId: null,
    error: null,
    building: null,
  });
  vi.mocked(window.trifold.characters.save).mockClear();
  vi.mocked(window.trifold.characters.list).mockResolvedValue([]);
  vi.mocked(window.trifold.characters.readPdf).mockReset();
});

async function startImport(name = '') {
  const user = userEvent.setup();
  render(<CharactersPage />);
  await user.click(await screen.findByRole('button', { name: 'New character' }));
  const panel = within(screen.getByTestId('new-character'));
  if (name) await user.type(panel.getByRole('textbox', { name: 'Character name' }), name);
  await user.click(panel.getByRole('radio', { name: /Import from PDF/ }));
  await user.click(panel.getByRole('button', { name: 'Start' }));
  return user;
}

describe('Import from PDF', () => {
  it('previews the sheet read, then creates the character with its rules and notes', async () => {
    vi.mocked(window.trifold.characters.readPdf).mockResolvedValue(preview);
    const user = await startImport();
    const panel = within(screen.getByTestId('pdf-import'));
    await user.click(panel.getByRole('button', { name: 'Choose PDF…' }));
    expect(panel.getByText('orrin.pdf')).toBeInTheDocument();
    expect(panel.getByRole('textbox', { name: 'Name' })).toHaveValue('Orrin Vale');
    expect(panel.getByRole('combobox', { name: 'Rules' })).toHaveValue('2014');
    expect(panel.getByTestId('pdf-warnings')).toHaveTextContent('No hit point maximum');
    expect(panel.getByTestId('sheet-view')).toHaveTextContent('Wizard 3 · Dwarf · Sage');
    expect(panel.getByText(/1 number kept as the PDF gives it/)).toBeInTheDocument();
    // The preview has nothing to edit, and nothing has been written.
    expect(panel.queryByRole('button', { name: /^Edit/ })).toBeNull();
    expect(window.trifold.characters.save).not.toHaveBeenCalled();

    await user.click(panel.getByRole('button', { name: 'Create character' }));
    expect(await screen.findByTestId('trifold-sheet')).toBeInTheDocument();
    expect(lastSaved()).toMatchObject({
      name: 'Orrin Vale',
      kind: 'trifold',
      edition: '2014',
      notes: 'Backstory: Raised in a mountain library.',
    });
    expect(lastSaved().sheet).toEqual(sheet);
  });

  it('keeps the name typed in New character over the sheet’s', async () => {
    vi.mocked(window.trifold.characters.readPdf).mockResolvedValue(preview);
    const user = await startImport('Orrin');
    const panel = within(screen.getByTestId('pdf-import'));
    await user.click(panel.getByRole('button', { name: 'Choose PDF…' }));
    expect(panel.getByRole('textbox', { name: 'Name' })).toHaveValue('Orrin');
  });

  it('shows why a PDF could not be read, and cancels back with nothing written', async () => {
    vi.mocked(window.trifold.characters.readPdf).mockRejectedValue(
      new Error('This PDF has no fields to read.'),
    );
    const user = await startImport();
    const panel = within(screen.getByTestId('pdf-import'));
    await user.click(panel.getByRole('button', { name: 'Choose PDF…' }));
    expect(panel.getByRole('alert')).toHaveTextContent('This PDF has no fields to read.');
    await user.click(panel.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText(/No characters yet/)).toBeInTheDocument();
    expect(window.trifold.characters.save).not.toHaveBeenCalled();
  });

  it('does nothing when the file picker is cancelled', async () => {
    vi.mocked(window.trifold.characters.readPdf).mockResolvedValue(null);
    const user = await startImport();
    const panel = within(screen.getByTestId('pdf-import'));
    await user.click(panel.getByRole('button', { name: 'Choose PDF…' }));
    expect(panel.getByRole('button', { name: 'Choose PDF…' })).toBeInTheDocument();
    expect(panel.queryByRole('alert')).toBeNull();
  });
});

describe('Update from PDF', () => {
  it('replaces the sheet of a Trifold character after a preview, and drops the build record', async () => {
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
      sheet: blankSheet(),
      build: {
        edition: '2024',
        class: { kind: 'class', key: 'wizard', name: 'Wizard' },
        background: { kind: 'background', key: 'sage', name: 'Sage' },
        species: { kind: 'species', key: 'dwarf', name: 'Dwarf' },
        size: 'Medium',
        abilityMethod: 'standard',
        baseScores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
        increase: { plus2: 'int', plus1: 'con' },
        classSkills: [],
        hitPoints: [],
        improvements: [],
      },
      notes: 'My own notes.',
      createdAt: '2026-11-23T00:00:00.000Z',
      updatedAt: '2026-11-23T00:00:00.000Z',
    };
    useCharacterStore.setState({ characters: [character], openId: 'K1' });
    vi.mocked(window.trifold.characters.readPdf).mockResolvedValue(preview);
    const user = userEvent.setup();
    const { rerender } = render(<TrifoldSheet character={character} />);
    await user.click(screen.getByRole('button', { name: 'Update from PDF…' }));
    const panel = within(screen.getByTestId('pdf-import'));
    await user.click(panel.getByRole('button', { name: 'Choose PDF…' }));
    expect(panel.getByText(/Replacing the sheet loses changes/)).toBeInTheDocument();
    await user.click(panel.getByRole('button', { name: 'Replace sheet' }));
    const next = useCharacterStore.getState().characters[0]!;
    expect(next.sheet).toEqual(sheet);
    expect(next.edition).toBe('2014');
    expect(next.build).toBeUndefined();
    // The player's own notes stay.
    expect(next.notes).toBe('My own notes.');
    rerender(<TrifoldSheet character={next} />);
    expect(screen.queryByTestId('pdf-import')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Level up' })).toBeNull();
  });
});

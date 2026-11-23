import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankSheet } from '@trifold/rules';
import type { Character } from '@trifold/schema';
import { useCharacterStore } from '../../stores/characterStore';
import { CharactersPage, characterLine } from './CharactersPage';

const now = '2026-11-23T00:00:00.000Z';
const external = (extra: Partial<Character> = {}): Character => ({
  schemaVersion: 1,
  id: 'C1',
  name: 'Aria',
  kind: 'external',
  edition: '2024',
  numbers: {
    classText: 'Bard 4',
    level: 4,
    maxHp: 27,
    ac: 14,
    initiativeBonus: 2,
    speed: 30,
    passives: { perception: 12, insight: 13, investigation: 10 },
    saves: { dex: 4, cha: 6 },
  },
  notes: '',
  createdAt: now,
  updatedAt: now,
  ...extra,
});

/** The last character written, as main received it. */
const lastSaved = () =>
  vi.mocked(window.trifold.characters.save).mock.calls.at(-1)?.[0] as Character;

beforeEach(() => {
  useCharacterStore.setState({ characters: [], loaded: false, openId: null, error: null });
  vi.mocked(window.trifold.characters.save).mockClear();
  vi.mocked(window.trifold.characters.remove).mockClear();
  vi.mocked(window.trifold.characters.list).mockResolvedValue([external()]);
});

describe('CharactersPage (ADR 0068)', () => {
  it('lists characters with their table numbers', async () => {
    render(<CharactersPage />);
    const row = await screen.findByTestId('character-row');
    expect(row).toHaveTextContent('Aria');
    expect(row).toHaveTextContent('Bard 4 · AC 14 · 27 HP');
    expect(row).toHaveTextContent('External');
    expect(characterLine(external({ numbers: { ...external().numbers, classText: '' } }))).toBe(
      'Level 4 · AC 14 · 27 HP',
    );
  });

  it('makes a Trifold character and opens it on its sheet', async () => {
    vi.mocked(window.trifold.characters.list).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<CharactersPage />);
    expect(await screen.findByText(/No characters yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New character' }));
    const panel = within(screen.getByTestId('new-character'));
    await user.type(panel.getByRole('textbox', { name: 'Character name' }), 'Bren');
    expect(panel.getByRole('radio', { name: /Trifold character/ })).toBeChecked();
    await user.click(panel.getByRole('button', { name: 'Create' }));
    expect(await screen.findByTestId('trifold-sheet')).toBeInTheDocument();
    expect(lastSaved()).toMatchObject({ name: 'Bren', kind: 'trifold' });
    expect(lastSaved().sheet).toEqual(blankSheet());
  });

  it('edits an External character’s numbers and link, saved a moment later', async () => {
    const user = userEvent.setup();
    render(<CharactersPage />);
    await user.click(await screen.findByRole('button', { name: 'Open Aria' }));
    const ac = screen.getByRole('spinbutton', { name: 'AC' });
    await user.clear(ac);
    await user.type(ac, '16');
    await user.type(screen.getByRole('textbox', { name: 'Character sheet link' }), 'ftp://x');
    expect(screen.getByRole('alert')).toHaveTextContent('starts with http:// or https://');
    await user.clear(screen.getByRole('textbox', { name: 'Character sheet link' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Character sheet link' }),
      'https://example.test/sheet',
    );
    await waitFor(() =>
      expect(lastSaved()).toMatchObject({
        numbers: { ac: 16 },
        sheetUrl: 'https://example.test/sheet',
      }),
    );
  });

  it('makes an External character a Trifold one, keeping its numbers', async () => {
    const user = userEvent.setup();
    render(<CharactersPage />);
    await user.click(await screen.findByRole('button', { name: 'Open Aria' }));
    await user.click(screen.getByRole('button', { name: 'Make it a Trifold character…' }));
    await user.click(screen.getByRole('button', { name: 'Make it a Trifold character' }));
    expect(await screen.findByTestId('trifold-sheet')).toBeInTheDocument();
    // The entered AC is kept, set by hand, until the sheet is filled in.
    expect(screen.getByRole('spinbutton', { name: 'AC' })).toHaveValue(14);
    expect(screen.getByRole('button', { name: 'Reset AC' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Class 1' })).toHaveValue('Bard');
    await waitFor(() => expect(lastSaved()).toMatchObject({ kind: 'trifold' }));
  });

  it('works out a Trifold sheet’s numbers, and an override resets', async () => {
    vi.mocked(window.trifold.characters.list).mockResolvedValue([
      external({ kind: 'trifold', sheet: blankSheet() }),
    ]);
    const user = userEvent.setup();
    render(<CharactersPage />);
    await user.click(await screen.findByRole('button', { name: 'Open Aria' }));
    const dex = screen.getByRole('spinbutton', { name: 'Dexterity' });
    await user.clear(dex);
    await user.type(dex, '16');
    expect(screen.getByRole('spinbutton', { name: 'AC' })).toHaveValue(13);
    expect(screen.getByRole('spinbutton', { name: 'Initiative' })).toHaveValue(3);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Stealth training' }),
      'expertise',
    );
    expect(screen.getByRole('spinbutton', { name: 'Stealth' })).toHaveValue(7);

    const ac = screen.getByRole('spinbutton', { name: 'AC' });
    await user.clear(ac);
    await user.type(ac, '15');
    await user.click(screen.getByRole('button', { name: 'Reset AC' }));
    expect(screen.getByRole('spinbutton', { name: 'AC' })).toHaveValue(13);

    await user.click(screen.getByRole('button', { name: 'Add an attack' }));
    await user.type(screen.getByRole('textbox', { name: 'Attack 1 name' }), 'Rapier');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rapier ability' }), 'dex');
    expect(screen.getByLabelText('Rapier to hit')).toHaveTextContent('+5');
    await waitFor(() =>
      expect(lastSaved().sheet).toMatchObject({
        abilities: { dex: 16 },
        skills: { stealth: 'expertise' },
        overrides: {},
        attacks: [{ name: 'Rapier', ability: 'dex' }],
      }),
    );
  });

  it('deletes a character only after DELETE is typed', async () => {
    const user = userEvent.setup();
    render(<CharactersPage />);
    await user.click(await screen.findByRole('button', { name: 'Open Aria' }));
    await user.click(screen.getByRole('button', { name: 'Delete Aria' }));
    const button = screen.getByRole('button', { name: 'Delete character' });
    expect(button).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Type DELETE to delete Aria' }), 'DELETE');
    await user.click(button);
    expect(window.trifold.characters.remove).toHaveBeenCalledWith('C1');
    expect(await screen.findByText(/No characters yet/)).toBeInTheDocument();
  });
});

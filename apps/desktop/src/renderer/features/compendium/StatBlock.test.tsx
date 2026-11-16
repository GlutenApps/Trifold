import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { useArtStore } from '../../stores/artStore';
import { StatBlock } from './StatBlock';

const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });

function monster(name: string): MonsterRecord {
  const r = records.find((x) => x.kind === 'monster' && x.name === name);
  if (!r || r.kind !== 'monster') throw new Error(name);
  return r;
}

describe('StatBlock', () => {
  it('renders a legacy block in the 2024 layout with derived initiative and PB', () => {
    render(<StatBlock record={monster('Aboleth')} onOpenSpell={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Aboleth' })).toBeInTheDocument();
    expect(screen.getByText('Initiative').nextSibling).toHaveTextContent('-1');
    expect(screen.getByText('CR').nextSibling).toHaveTextContent('10 (XP 5,900; PB +4)');
    expect(screen.getByText('Legendary actions')).toBeInTheDocument();
    expect(screen.getByText('Lair')).toBeInTheDocument();
    expect(screen.getByText('Psychic Drain')).toBeInTheDocument();
    expect(screen.getByText('(Costs 2 Actions)')).toBeInTheDocument();
  });

  it('uses the 2024 init and proficiency bonus when present and shows Treasure under DM info', () => {
    render(<StatBlock record={monster('Aboleth [5.5e]')} onOpenSpell={() => undefined} />);
    expect(screen.getByText('Initiative').nextSibling).toHaveTextContent('+7');
    expect(screen.getByText('DM info')).toBeInTheDocument();
    expect(screen.getByText('Treasure.')).toBeInTheDocument();
    expect(screen.getByText('(2/Day)')).toBeInTheDocument();
  });

  it('links spells from the spell list', async () => {
    const onOpenSpell = vi.fn();
    render(<StatBlock record={monster('Mage')} onOpenSpell={onOpenSpell} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fireball' }));
    expect(onOpenSpell).toHaveBeenCalledWith('fireball');
    expect(screen.getByText(/Slots:/)).toHaveTextContent('1: 4 · 2: 3 · 3: 3 · 4: 3 · 5: 1');
  });

  it('shows the creature’s art, shared by every source and edition (ADR 0033)', () => {
    const aboleth = monster('Aboleth');
    const { rerender } = render(<StatBlock record={aboleth} onOpenSpell={() => undefined} />);
    expect(screen.queryByTestId('art-thumb')).toBeNull();
    useArtStore.setState({
      byKey: {
        [`monster:${aboleth.key}`]: {
          kind: 'monster',
          key: aboleth.key,
          path: `art/monster/${aboleth.key}.png`,
          version: 7,
        },
      },
    });
    rerender(<StatBlock record={aboleth} onOpenSpell={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Aboleth' })).toHaveAttribute(
      'src',
      'trifold-media://library/art/monster/aboleth.png?v=7',
    );
    useArtStore.setState({ byKey: {} });
  });

  it('rolls the creature’s saves, checks, skills, initiative and hit dice when it can', async () => {
    const aboleth = monster('Aboleth');
    const actions = {
      onAttack: vi.fn(),
      onRoll: vi.fn(),
      onMultiattack: vi.fn(),
      onTest: vi.fn(),
      onDice: vi.fn(),
    };
    render(<StatBlock record={aboleth} onOpenSpell={() => undefined} actions={actions} />);
    const wis = aboleth.data.saves.wis!;
    await userEvent.click(screen.getByRole('button', { name: `Roll Wis save +${wis}` }));
    expect(actions.onTest).toHaveBeenLastCalledWith(
      { kind: 'save', label: 'Wis save', modifier: wis },
      'normal',
    );
    // Shift-click rolls with advantage, as the attack badges do.
    fireEvent.click(screen.getByRole('button', { name: 'Roll Str check +5' }), { shiftKey: true });
    expect(actions.onTest).toHaveBeenLastCalledWith(
      { kind: 'check', label: 'Str check', modifier: 5 },
      'advantage',
    );
    await userEvent.click(screen.getByRole('button', { name: /^Roll Perception \+\d+$/ }));
    expect(actions.onTest).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'check', label: 'Perception' }),
      'normal',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Roll Initiative -1' }));
    expect(actions.onTest).toHaveBeenLastCalledWith(
      { kind: 'check', label: 'Initiative', modifier: -1 },
      'normal',
    );
    await userEvent.click(screen.getByTitle(/Roll hit points/));
    expect(actions.onDice).toHaveBeenCalledWith('Hit points', aboleth.data.hp!.formula);
  });

  it('leaves saves and checks as plain text without roll handlers', () => {
    render(<StatBlock record={monster('Aboleth')} onOpenSpell={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Roll / })).toBeNull();
  });
});

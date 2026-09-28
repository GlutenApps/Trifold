import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
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
});

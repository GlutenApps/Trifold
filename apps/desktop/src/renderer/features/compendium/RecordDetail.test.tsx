import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCompendiumXml } from '@trifold/importers';
import type { CompendiumRecord } from '@trifold/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { useRollLogStore } from '../../stores/rollLogStore';
import { RecordDetail } from './RecordDetail';

const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });

function record(name: string): CompendiumRecord {
  const r = records.find((x) => x.name === name);
  if (!r) throw new Error(name);
  return r;
}

function renderDetail(current: CompendiumRecord, editions: CompendiumRecord[] = [current]) {
  const onSwitchEdition = vi.fn();
  render(
    <RecordDetail
      record={current}
      editions={editions}
      canGoBack={false}
      onBack={() => undefined}
      onSwitchEdition={onSwitchEdition}
      onOpenSpell={() => undefined}
    />,
  );
  return { onSwitchEdition };
}

describe('RecordDetail', () => {
  beforeEach(() => {
    useRollLogStore.getState().clear();
    // Reduced motion settles the roll reveal at once, so the result line shows the total now.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({ matches: true })),
    });
  });

  it('offers both rulesets of a record and switches between them', async () => {
    const legacy = record('Aboleth');
    const modern = record('Aboleth [5.5e]');
    const { onSwitchEdition } = renderDetail(modern, [modern, legacy]);
    const group = screen.getByRole('group', { name: 'Switch edition' });
    expect(within(group).getByRole('button', { name: '2024' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Legacy' }));
    expect(onSwitchEdition).toHaveBeenCalledWith(legacy);
  });

  it('rolls an attack pill into the shared log and shows the result above the block', async () => {
    renderDetail(record('Goblin Warrior [5.5e]'));
    expect(screen.queryByTestId('detail-last-roll')).not.toBeInTheDocument();
    const pill = screen.getAllByRole('button', { name: /slashing/i })[0]!;
    await userEvent.click(pill);
    const entries = useRollLogStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: 'compendium', actor: 'Goblin Warrior' });
    expect(screen.getByTestId('detail-last-roll')).toHaveTextContent(String(entries[0]!.total));
  });

  it('rolls a spell’s dice from a pill', async () => {
    const fireball = record('Fireball');
    if (fireball.kind !== 'spell' || fireball.data.rolls.length === 0) throw new Error('fixture');
    renderDetail(fireball);
    const pill = screen.getAllByRole('button', { name: /d6/ })[0]!;
    await userEvent.click(pill);
    const [entry] = useRollLogStore.getState().entries;
    expect(entry).toMatchObject({ kind: 'dice', source: 'compendium', actor: 'Fireball' });
    expect(screen.getByTestId('detail-last-roll')).toHaveTextContent(String(entry!.total));
  });
});

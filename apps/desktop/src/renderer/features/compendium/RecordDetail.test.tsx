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

  it('shows a condition’s text with its bullets as a list', () => {
    const blinded: CompendiumRecord = {
      schemaVersion: 1,
      id: 'srd-2024:condition:blinded',
      kind: 'condition',
      key: 'blinded',
      name: 'Blinded',
      displayName: 'Blinded',
      sourceId: 'srd-2024',
      edition: '2024',
      tags: [],
      data: {
        text: 'While you have the condition, these apply.\n * First. One thing.\n * Second. Another.',
        extra: {},
      },
    };
    renderDetail(blinded);
    expect(screen.getByRole('heading', { name: 'Blinded' })).toBeInTheDocument();
    expect(screen.getByText('While you have the condition, these apply.')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['First. One thing.', 'Second. Another.']);
  });

  it('offers both rulesets of a record and switches between them', async () => {
    const legacy = record('Aboleth');
    const modern = record('Aboleth [5.5e]');
    const { onSwitchEdition } = renderDetail(modern, [modern, legacy]);
    const select = screen.getByRole('combobox', { name: 'Switch edition' });
    expect(select).toHaveValue(modern.id);
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringMatching(/^2024 · /), expect.stringMatching(/^Legacy · /)]);
    await userEvent.selectOptions(select, legacy.id);
    expect(onSwitchEdition).toHaveBeenCalledWith(legacy);
    // No source-text view any more (ADR 0026).
    expect(screen.queryByRole('button', { name: 'Source text' })).toBeNull();
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

  it('puts Back to results ahead of the history back when the list is hidden', async () => {
    const onBack = vi.fn();
    const onBackToResults = vi.fn();
    render(
      <RecordDetail
        record={record('Fireball')}
        editions={[record('Fireball')]}
        canGoBack
        backTo="Mage"
        onBack={onBack}
        onBackToResults={onBackToResults}
        onSwitchEdition={() => undefined}
        onOpenSpell={() => undefined}
      />,
    );
    const [results, history] = screen.getAllByRole('button', { name: /^Back to/ });
    expect(results).toHaveAccessibleName('Back to results');
    expect(history).toHaveAccessibleName('Back to Mage');
    await userEvent.click(results!);
    expect(onBackToResults).toHaveBeenCalledOnce();
    expect(onBack).not.toHaveBeenCalled();
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

  it('offers Duplicate to homebrew on a spell, in the bar, and no homebrew bar on an original', async () => {
    const onDuplicate = vi.fn();
    render(
      <RecordDetail
        record={record('Fireball')}
        editions={[record('Fireball')]}
        canGoBack={false}
        onBack={() => undefined}
        onSwitchEdition={() => undefined}
        onOpenSpell={() => undefined}
        homebrew={{ onDuplicate, onEdit: () => undefined, onRemove: () => undefined }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate to homebrew' }));
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('homebrew-bar')).toBeNull();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });
});

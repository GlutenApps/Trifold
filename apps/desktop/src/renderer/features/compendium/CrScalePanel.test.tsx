import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { CrScalePanel } from './CrScalePanel';
import { StatBlock } from './StatBlock';

/** The CR scaler in the monster editor (ADR 0038): preview, untick, apply to the form. */
const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

describe('CrScalePanel', () => {
  it('previews each change, leaves out an unticked part and applies to the form', async () => {
    const onApply = vi.fn();
    render(<CrScalePanel data={goblin.data} name="Goblin Warrior" onApply={onApply} />);
    const panel = screen.getByTestId('cr-scale');
    // Always on show; the preview and Apply appear once another CR is picked.
    expect(within(panel).queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'One CR higher' }));
    expect(screen.getByRole('combobox', { name: 'New challenge rating' })).toHaveValue('1/2');
    await userEvent.click(within(panel).getByRole('button', { name: 'Keep CR 1/4' }));
    expect(within(panel).queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'New challenge rating' }),
      '3',
    );
    expect(screen.getByTestId('cr-scale-cr')).toHaveTextContent(
      `${goblin.data.cr} (50 XP) → 3 (700 XP)`,
    );
    expect(within(panel).getByRole('checkbox', { name: 'Hit points' })).toBeChecked();
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Armor class' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply CR 3 to the form' }));

    const applied = onApply.mock.calls[0]![0] as MonsterRecord['data'];
    expect(applied.cr).toBe('3');
    expect(applied.ac?.value).toBe(goblin.data.ac?.value);
    expect(applied.hp!.average).toBeGreaterThan(goblin.data.hp!.average);
    expect(applied.scaled).toEqual({ fromCr: goblin.data.cr, toCr: '3' });
  });

  it('shows the Scaled tag on the stat block, the name unchanged', () => {
    const scaled = {
      ...goblin,
      data: { ...goblin.data, cr: '3', scaled: { fromCr: '1/4', toCr: '3' } },
    };
    render(<StatBlock record={scaled} onOpenSpell={() => undefined} />);
    expect(screen.getByTestId('scaled-tag')).toHaveTextContent('Scaled CR 1/4 → 3');
    expect(screen.getByRole('heading', { name: goblin.displayName })).toBeInTheDocument();
  });
});

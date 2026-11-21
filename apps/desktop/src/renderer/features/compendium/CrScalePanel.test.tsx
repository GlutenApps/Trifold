import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseCompendiumXml } from '@trifold/importers';
import { scaleCr, SCALE_PARTS } from '@trifold/rules';
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
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Attack bonuses' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply CR 3 to the form' }));

    const applied = onApply.mock.calls[0]![0] as MonsterRecord['data'];
    expect(applied.cr).toBe('3');
    const toHit = (d: MonsterRecord['data']) =>
      /([+-]\d+)( to hit|,)/.exec(d.actions.map((a) => a.text).join(' '))?.[1];
    expect(toHit(goblin.data)).toBeDefined();
    expect(toHit(applied)).toBe(toHit(goblin.data));
    expect(applied.hp!.average).toBeGreaterThan(goblin.data.hp!.average);
    expect(applied.scaled).toEqual({ fromCr: goblin.data.cr, toCr: '3' });
  });

  it('ticks the extra attacks too, and the CR drops when they are left out (ADR 0048, ADR 0051)', async () => {
    const onApply = vi.fn();
    render(<CrScalePanel data={goblin.data} name="Goblin Warrior" onApply={onApply} />);
    const panel = screen.getByTestId('cr-scale');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'New challenge rating' }),
      '5',
    );
    const extra = within(panel).getByRole('checkbox', { name: 'Add attacks' });
    expect(extra).toBeChecked();
    expect(screen.getByTestId('cr-scale-cr')).toHaveTextContent('→ 5 (1,800 XP)');
    expect(screen.queryByTestId('cr-scale-short')).not.toBeInTheDocument();

    await userEvent.click(extra);
    expect(screen.getByTestId('cr-scale-cr')).toHaveTextContent('→ 4 (1,100 XP)');
    expect(screen.getByTestId('cr-scale-short')).toHaveTextContent('CR 5 with everything ticked');
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply CR 4 to the form' }));
    const applied = onApply.mock.calls[0]![0] as MonsterRecord['data'];
    expect(applied.cr).toBe('4');
    expect(applied.actions.some((f) => /multiattack/i.test(f.name))).toBe(false);
  });

  it('tunes one part at its own CR, and Balance lands back on the CR picked (ADR 0051)', async () => {
    const onApply = vi.fn();
    render(<CrScalePanel data={goblin.data} name="Goblin Warrior" onApply={onApply} />);
    const panel = screen.getByTestId('cr-scale');
    await userEvent.click(within(panel).getByRole('button', { name: 'Tune' }));
    // At its own CR nothing has moved yet, so there is nothing to apply.
    expect(within(panel).getByRole('button', { name: /^Apply/ })).toBeDisabled();

    // One more attack and nothing else: the CR climbs.
    await userEvent.click(within(panel).getByRole('button', { name: 'One attack more' }));
    expect(screen.getByTestId('cr-scale-short')).toHaveTextContent('aiming for CR 1/4');
    expect(screen.getByTestId('cr-scale-cr')).not.toHaveTextContent('→ 1/4 (50 XP)');
    expect(within(panel).getByTestId('cr-tune')).toHaveTextContent('one attack → two attacks');

    // Picking a CR starts the tune from quick scale's result for it. Trade damage for hit
    // points: two steps more hit points, then Balance takes the damage down to land on CR 5.
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'New challenge rating' }),
      '5',
    );
    expect(screen.queryByTestId('cr-scale-short')).not.toBeInTheDocument();
    const quickHp = scaleCr(goblin.data, '5', new Set(SCALE_PARTS)).monster.hp!.average;
    const up = within(panel).getByRole('button', { name: 'Raise hit points' });
    await userEvent.click(up);
    await userEvent.click(up);
    expect(screen.getByTestId('cr-scale-short')).toHaveTextContent('aiming for CR 5');
    await userEvent.click(within(panel).getByRole('button', { name: 'Balance with damage' }));
    expect(screen.queryByTestId('cr-scale-short')).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Apply CR 5 to the form' }));
    const applied = onApply.mock.calls[0]![0] as MonsterRecord['data'];
    expect(applied.cr).toBe('5');
    expect(applied.hp!.average).toBeGreaterThan(quickHp);
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

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { parseCompendiumXml } from '@trifold/importers';
import type { CombatantTemplate, CompendiumRecord, MonsterRecord } from '@trifold/schema';
import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { DifficultyBar } from './DifficultyBar';
import {
  canRescaleInPlace,
  enemyXp,
  retargetScaled,
  scaleRows,
  stepAll,
  type CampaignUses,
} from './quickScale';

/** Quick scale in the encounter builder (ADR 0038 §7). */
const { records } = parseCompendiumXml(fixture, { sourceId: 'srd', defaultEdition: '2014' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

const row = (id: string, patch: Partial<CombatantTemplate> = {}): CombatantTemplate => ({
  id,
  ref: {
    kind: 'record',
    ref: { recordId: goblin.id, sourceId: goblin.sourceId, key: goblin.key, edition: '2024' },
    name: goblin.displayName,
  },
  quantity: 1,
  role: 'enemy',
  hidden: false,
  cache: { xp: goblin.data.xp, cr: goblin.data.cr, type: 'Fey', hp: 10, ac: 15 },
  ...patch,
});
const pc = (id: string): CombatantTemplate => ({
  id,
  ref: { kind: 'pc', pcId: id, name: id },
  quantity: 1,
  role: 'ally',
  hidden: false,
});
const uses = (patch: Partial<CampaignUses> = {}): CampaignUses => ({
  slug: 'here',
  encounters: [],
  npcs: [],
  ...patch,
});

/** A stand-in main process: an index of records and the saves made. */
function fakeIo(initial: CompendiumRecord[]) {
  const byId = new Map(initial.map((r) => [r.id, r]));
  let n = 0;
  const saved: CompendiumRecord[] = [];
  return {
    saved,
    io: {
      get: async (id: string) => byId.get(id) ?? null,
      draft: async (id: string) => {
        const r = byId.get(id)!;
        return {
          ...r,
          id: `creature:monster:${++n}`,
          sourceId: 'campaign:here',
          name: `Copy of ${r.displayName}`,
          displayName: `Copy of ${r.displayName}`,
          basedOn: { recordId: r.id, sourceId: r.sourceId },
        };
      },
      save: vi.fn(async (r: CompendiumRecord) => {
        byId.set(r.id, r);
        saved.push(r);
        return r;
      }),
    },
  };
}

describe('quick scale', () => {
  it('counts enemies at the picked CR, and steps every creature together', () => {
    const rows = [row('a', { quantity: 2 }), row('b', { role: 'ally' }), pc('p')];
    expect(enemyXp(rows, {})).toBe(goblin.data.xp * 2);
    expect(enemyXp(rows, { a: '3' })).toBe(700 * 2);
    expect(stepAll(rows, {}, 1)).toEqual({ a: '1/2', b: '1/2' });
    expect(stepAll(rows, { a: '30' }, 1)).toMatchObject({ a: '30' });
  });

  it('saves one same-named scaled copy per creature and CR, and points the rows at it', async () => {
    const { io, saved } = fakeIo([goblin]);
    const rows = [row('a', { label: 'Lookout', hpOverride: 4 }), row('b'), row('c')];
    const { targets, unused } = await scaleRows(rows, { a: '3', b: '3', c: '1' }, uses(), 'e1', io);
    expect(unused).toEqual([]);

    expect(saved).toHaveLength(2);
    expect(saved[0]!.displayName).toBe(goblin.displayName);
    expect(saved[0]!.sourceId).toBe('campaign:here');
    expect((saved[0] as MonsterRecord).data.scaled).toEqual({ fromCr: goblin.data.cr, toCr: '3' });
    expect(targets.get('a')!.ref).toEqual(targets.get('b')!.ref);
    expect(targets.get('c')!.cache.cr).toBe('1');

    const next = retargetScaled(rows, targets);
    expect(next[0]).toMatchObject({ label: 'Lookout', cache: { cr: '3', xp: 700 } });
    expect(next[0]!.hpOverride).toBeUndefined();
  });

  it('rescales its own copy in place unless something else uses it, and goes back to the original', async () => {
    const copy: MonsterRecord = {
      ...goblin,
      id: 'creature:monster:mine',
      sourceId: 'campaign:here',
      basedOn: { recordId: goblin.id, sourceId: goblin.sourceId },
      data: { ...goblin.data, cr: '3', xp: 700, scaled: { fromCr: goblin.data.cr, toCr: '3' } },
    };
    const onCopy = row('a', {
      ref: {
        kind: 'record',
        ref: { recordId: copy.id, sourceId: copy.sourceId, key: copy.key, edition: '2024' },
        name: copy.displayName,
      },
      cache: { xp: 700, cr: '3', type: 'Fey', hp: 30, ac: 16 },
    });

    expect(canRescaleInPlace(copy, uses(), 'e1', [onCopy], new Set(['a']))).toBe(true);
    const elsewhere = uses({ encounters: [{ id: 'e2', combatants: [onCopy], state: null }] });
    expect(canRescaleInPlace(copy, elsewhere, 'e1', [onCopy], new Set(['a']))).toBe(false);
    expect(
      canRescaleInPlace(
        copy,
        uses({ npcs: [{ recordRef: onCopy.ref.kind === 'record' ? onCopy.ref.ref : undefined }] }),
        'e1',
        [onCopy],
        new Set(['a']),
      ),
    ).toBe(false);
    // A token the row placed follows it; any other token on the copy keeps it.
    const token = (id: string) => ({ id, ref: onCopy.ref });
    const placed = { ...onCopy, tokenId: 't1' };
    expect(
      canRescaleInPlace(
        copy,
        uses({ scenes: [{ tokens: [token('t1')] }] }),
        'e1',
        [placed],
        new Set(['a']),
      ),
    ).toBe(true);
    expect(
      canRescaleInPlace(
        copy,
        uses({ scenes: [{ tokens: [token('t2')] }] }),
        'e1',
        [placed],
        new Set(['a']),
      ),
    ).toBe(false);
    // Another row on the copy going elsewhere needs the copy kept.
    expect(
      canRescaleInPlace(copy, uses(), 'e1', [onCopy, { ...onCopy, id: 'b' }], new Set(['a'])),
    ).toBe(false);

    const { io, saved } = fakeIo([goblin, copy]);
    const up = await scaleRows([onCopy], { a: '5' }, uses(), 'e1', io);
    expect(saved[0]!.id).toBe(copy.id);
    expect(up.targets.get('a')!.cache.cr).toBe('5');
    expect(up.unused).toEqual([]);

    // Back to the original: the row points at it again and the copy, used nowhere, is unused.
    const back = await scaleRows([onCopy], { a: goblin.data.cr }, uses(), 'e1', io);
    const ref = back.targets.get('a')!.ref;
    expect(ref.kind === 'record' && ref.ref.recordId).toBe(goblin.id);
    expect(back.unused).toEqual([copy.id]);
    const elsewhereBack = await scaleRows([onCopy], { a: goblin.data.cr }, elsewhere, 'e1', io);
    expect(elsewhereBack.unused).toEqual([]);
  });
});

describe('DifficultyBar', () => {
  function Harness({ onApply }: { onApply(p: Record<string, string>): void }) {
    const [pending, setPending] = useState<Record<string, string>>({});
    const [scaling, setScaling] = useState(false);
    return (
      <DifficultyBar
        templates={[row('a', { quantity: 4 }), pc('p')]}
        partyLevels={[3, 3, 3, 3]}
        pending={pending}
        scaling={scaling}
        busy={false}
        error={null}
        onToggleScale={() => setScaling((v) => !v)}
        onPick={setPending}
        onApply={() => onApply(pending)}
        onCancel={() => {
          setScaling(false);
          setPending({});
        }}
      />
    );
  }

  it('shows the band at the top and follows each pick live until Apply', async () => {
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);
    // Four goblins (50 XP each) against four level 3 PCs: below Low (600).
    expect(screen.getByTestId('difficulty-band')).toHaveTextContent('Trivial');

    await userEvent.click(screen.getByRole('button', { name: 'Scale' }));
    const list = screen.getByRole('group', { name: 'Scale the creatures' });
    expect(within(list).getByRole('button', { name: 'Apply' })).toBeDisabled();

    await userEvent.selectOptions(
      within(list).getByRole('combobox', { name: `New CR for ${goblin.displayName}` }),
      '1',
    );
    // 4 × 200 = 800: between Low (600) and Moderate (900).
    expect(screen.getByTestId('difficulty-band')).toHaveTextContent('Low');
    await userEvent.click(
      within(list).getByRole('button', { name: 'Every creature one CR higher' }),
    );
    expect(screen.getByTestId('difficulty-band')).toHaveTextContent('High');

    await userEvent.click(within(list).getByRole('button', { name: 'Apply 1 change' }));
    expect(onApply).toHaveBeenCalledWith({ a: '2' });
  });
});

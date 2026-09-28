import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { describe, expect, it } from 'vitest';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { diffRecords } from './recordDiff';

const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

describe('record diff', () => {
  it('is empty for an untouched copy', () => {
    expect(diffRecords(goblin, { ...goblin })).toEqual([]);
  });

  it('lists changed scalars, lists and features', () => {
    const copy: MonsterRecord = {
      ...goblin,
      displayName: 'Goblin Champion',
      data: {
        ...goblin.data,
        cr: '2',
        damageResistances: ['cold'],
        actions: [
          { ...goblin.data.actions[0]!, text: 'Hits harder.' },
          {
            name: 'Rally',
            displayName: 'Rally',
            text: 'Allies gain 5 temp HP.',
            tags: [],
            attacks: [],
            rolls: [],
            saves: [],
          },
        ],
      },
    };
    const lines = diffRecords(goblin, copy);
    expect(lines).toContainEqual({ field: 'Name', from: 'Goblin Warrior', to: 'Goblin Champion' });
    expect(lines).toContainEqual({ field: 'cr', from: goblin.data.cr, to: '2' });
    expect(lines).toContainEqual({ field: 'damageResistances', from: '—', to: 'cold' });
    expect(
      lines.find((l) => l.field === `Actions: ${goblin.data.actions[0]!.displayName}`)?.to,
    ).toBe('Hits harder.');
    expect(lines).toContainEqual({
      field: 'Actions: Rally',
      from: '(new)',
      to: 'Allies gain 5 temp HP.',
    });
    const removed = goblin.data.actions.slice(1).map((f) => `Actions: ${f.displayName}`);
    for (const field of removed) expect(lines.find((l) => l.field === field)?.to).toBe('(removed)');
  });
});

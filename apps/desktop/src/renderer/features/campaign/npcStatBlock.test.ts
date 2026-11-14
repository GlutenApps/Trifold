import { describe, expect, it, vi } from 'vitest';
import { parseCompendiumXml } from '@trifold/importers';
import type { CombatantTemplate, CompendiumRecord, MonsterRecord, NPC } from '@trifold/schema';
import fixture from '../../../../../../fixtures/compendium-sample.xml?raw';
import { blankNpc } from './CharacterEditors';
import { editsInPlace, hpAfterScale, saveStatBlock, withNpcCache } from './npcStatBlock';

/** Saving an NPC's stat block from its form (ADR 0039). */
const goblin = parseCompendiumXml(fixture, {
  sourceId: 'srd',
  defaultEdition: '2014',
}).records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;
const own: MonsterRecord = {
  ...goblin,
  id: 'creature:monster:own',
  sourceId: 'campaign:here',
  basedOn: { recordId: goblin.id, sourceId: goblin.sourceId },
};
const npcOn = (record: MonsterRecord, patch: Partial<NPC> = {}): NPC => ({
  ...blankNpc(),
  id: 'n1',
  name: 'Captain Vex',
  recordRef: { recordId: record.id, sourceId: record.sourceId, key: record.key, edition: '2024' },
  ...patch,
});
const io = () => ({
  draft: vi.fn(async (id: string): Promise<CompendiumRecord> => ({
    ...goblin,
    id: 'creature:monster:copy',
    sourceId: 'campaign:here',
    name: 'Copy of Goblin Warrior',
    displayName: 'Copy of Goblin Warrior',
    basedOn: { recordId: id, sourceId: goblin.sourceId },
  })),
  save: vi.fn(async (r: CompendiumRecord) => r),
});
const scaled = (r: MonsterRecord): MonsterRecord => ({
  ...r,
  data: { ...r.data, cr: '2', xp: 450, hp: { average: 40 } },
});

describe('NPC stat block edits', () => {
  it('edits in place only a campaign creature no other NPC uses', () => {
    const campaign = { slug: 'here', npcs: [npcOn(own)] };
    expect(editsInPlace(npcOn(own), campaign)).toBe(true);
    expect(editsInPlace(npcOn(goblin), campaign)).toBe(false);
    const shared = { slug: 'here', npcs: [npcOn(own), npcOn(own, { id: 'n2', name: 'Other' })] };
    expect(editsInPlace(npcOn(own), shared)).toBe(false);
  });

  it('keeps the share of damage when the stat block HP moves', () => {
    expect(hpAfterScale({ current: 20, max: 27, temp: 3 }, 27, 65)).toEqual({
      current: 48,
      max: 65,
      temp: 3,
    });
    expect(hpAfterScale({ current: 27, max: 27, temp: 0 }, 27, 65)).toMatchObject({ current: 65 });
    expect(hpAfterScale({ current: 0, max: 27, temp: 0 }, 27, 65)).toMatchObject({ current: 0 });
    expect(hpAfterScale(undefined, 27, 65)).toBeUndefined();
    const same = { current: 5, max: 27, temp: 0 };
    expect(hpAfterScale(same, 27, 27)).toBe(same);
  });

  it('updates its own stat block in place, keeping the NPC on it', async () => {
    const calls = io();
    const npc = npcOn(own, { hp: { current: 10, max: 10, temp: 0 } });
    const out = await saveStatBlock(
      npc,
      { original: own, edited: scaled(own), inPlace: true },
      calls,
    );
    expect(calls.draft).not.toHaveBeenCalled();
    expect(out.record.id).toBe(own.id);
    expect(out.npc.recordRef?.recordId).toBe(own.id);
    expect(out.npc.hp).toEqual({ current: 40, max: 40, temp: 0 });
  });

  it('copies a stat block that lives elsewhere and relinks the NPC; the original stays', async () => {
    const calls = io();
    const out = await saveStatBlock(
      npcOn(goblin),
      { original: goblin, edited: scaled(goblin), inPlace: false },
      calls,
    );
    expect(calls.draft).toHaveBeenCalledWith(goblin.id);
    expect(out.record).toMatchObject({
      id: 'creature:monster:copy',
      displayName: goblin.displayName,
      basedOn: { recordId: goblin.id },
    });
    expect(out.record.data.cr).toBe('2');
    expect(out.npc.recordRef).toMatchObject({ recordId: 'creature:monster:copy' });
    expect(calls.save).toHaveBeenCalledTimes(1);
  });

  it('gives the encounter rows holding the NPC its new numbers', () => {
    const npc = npcOn(own, { hp: { current: 30, max: 40, temp: 0 } });
    const rows: CombatantTemplate[] = [
      {
        id: 'a',
        ref: { kind: 'npc', npcId: 'n1', name: 'Captain Vex' },
        quantity: 1,
        role: 'enemy',
        hidden: false,
      },
      {
        id: 'b',
        ref: { kind: 'pc', pcId: 'p', name: 'Thora' },
        quantity: 1,
        role: 'ally',
        hidden: false,
      },
    ];
    const next = withNpcCache(rows, npc, scaled(own))!;
    expect(next[0]!.cache).toMatchObject({ cr: '2', xp: 450, hp: 40 });
    expect(next[1]).toBe(rows[1]);
    expect(withNpcCache([rows[1]!], npc, own)).toBeNull();
  });
});

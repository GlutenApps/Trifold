import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { HomebrewRepository } from './homebrew';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fixture = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml'),
  'utf8',
);
const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

describe('HomebrewRepository', () => {
  let root: string;
  let repo: HomebrewRepository;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-homebrew-'));
    repo = new HomebrewRepository(await LibraryStore.open(root), logger);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('duplicates a record into the homebrew source with provenance', async () => {
    const copy = await repo.duplicate(goblin);
    expect(copy.sourceId).toBe('homebrew');
    expect(copy.id).toMatch(/^homebrew:monster:/);
    expect(copy.displayName).toBe('Copy of Goblin Warrior');
    expect(copy.key).toBe('copy of goblin warrior');
    expect(copy.basedOn).toEqual({ recordId: goblin.id, sourceId: 'src' });
    expect(copy.edition).toBe(goblin.edition);
    const onDisk = JSON.parse(
      await readFile(join(root, 'homebrew', `${copy.id.replace(/:/g, '_')}.json`), 'utf8'),
    );
    expect(onDisk.displayName).toBe('Copy of Goblin Warrior');
    expect((await repo.list()).map((r) => r.id)).toEqual([copy.id]);
    expect(await repo.get(copy.id)).toMatchObject({ id: copy.id });
  });

  it('re-derives attacks and saves from edited feature text on save', async () => {
    const copy = (await repo.duplicate(goblin)) as MonsterRecord;
    const edited: MonsterRecord = {
      ...copy,
      displayName: '  Goblin Champion ',
      data: {
        ...copy.data,
        actions: [
          {
            name: 'Greatsword (Recharge 5–6)',
            displayName: 'Greatsword',
            text: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage. The target must succeed on a DC 13 Strength saving throw or be knocked prone.',
            tags: [],
            attacks: [],
            rolls: [],
            saves: [],
          },
        ],
      },
    };
    const saved = (await repo.save(edited)) as MonsterRecord;
    expect(saved.displayName).toBe('Goblin Champion');
    expect(saved.key).toBe('goblin champion');
    const sword = saved.data.actions[0]!;
    expect(sword.displayName).toBe('Greatsword');
    expect(sword.recharge).toMatchObject({ min: 5 });
    expect(sword.attacks[0]).toMatchObject({ toHit: 6, damage: '2d6+4', damageType: 'slashing' });
    expect(sword.saves[0]).toMatchObject({ ability: 'str', dc: 13 });
  });

  it('exposes a virtual source whose hash follows the files, and removes records', async () => {
    const before = await repo.source();
    expect(before).toMatchObject({ id: 'homebrew', kind: 'homebrew', recordCounts: {} });
    const copy = await repo.duplicate(goblin);
    const after = await repo.source();
    expect(after.fileHash).not.toBe(before.fileHash);
    expect(after.recordCounts).toEqual({ monster: 1 });
    await repo.remove(copy.id);
    expect(await repo.list()).toEqual([]);
    await expect(repo.save({ ...goblin })).rejects.toThrow('Only homebrew records');
  });
});

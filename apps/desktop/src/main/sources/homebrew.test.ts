import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseCompendiumXml } from '@trifold/importers';
import type { MonsterRecord } from '@trifold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { campaignCreatures, HomebrewRepository } from './homebrew';

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

  it('makes the same copy without writing it until it is saved', async () => {
    const draft = repo.copyOf(goblin);
    expect(draft).toMatchObject({
      sourceId: 'homebrew',
      displayName: 'Copy of Goblin Warrior',
      basedOn: { recordId: goblin.id, sourceId: 'src' },
    });
    expect(await repo.list()).toEqual([]);
    const saved = await repo.save({ ...draft, displayName: 'Grik' });
    expect((await repo.list()).map((r) => r.displayName)).toEqual(['Grik']);
    expect(saved.key).toBe('grik');
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
    await expect(repo.save({ ...goblin })).rejects.toThrow(/Only Homebrew records/);
  });
});

describe('a campaign’s creatures (ADR 0035)', () => {
  let root: string;
  let store: LibraryStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-creatures-'));
    store = await LibraryStore.open(root);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('keeps them in the campaign folder as the campaign’s own source', async () => {
    const creatures = new HomebrewRepository(
      store,
      logger,
      campaignCreatures('greyford', 'Greyford'),
    );
    const draft = creatures.copyOf(goblin);
    expect(draft.sourceId).toBe('campaign:greyford');
    expect(draft.id).toMatch(/^creature:monster:/);
    expect(draft.sourceBook).toBe('Greyford');
    const saved = await creatures.save({ ...draft, displayName: 'Grik' });
    expect(await readdir(join(root, 'campaigns', 'greyford', 'creatures'))).toEqual([
      `${saved.id.replace(/:/g, '_')}.json`,
    ]);
    const source = await creatures.source();
    expect(source).toMatchObject({ id: 'campaign:greyford', name: 'Greyford', kind: 'campaign' });
    expect(source.recordCounts).toEqual({ monster: 1 });
    // The Library's homebrew does not see them, and will not save one.
    const library = new HomebrewRepository(store, logger);
    expect(await library.list()).toEqual([]);
    await expect(library.save(saved)).rejects.toThrow(/Homebrew records/);
  });

  it('takes a file copied in from another campaign as its own', async () => {
    const elsewhere = new HomebrewRepository(store, logger, campaignCreatures('old', 'Old'));
    const saved = await elsewhere.save(elsewhere.copyOf(goblin));
    const raw = await readFile(
      join(root, 'campaigns', 'old', 'creatures', `${saved.id.replace(/:/g, '_')}.json`),
      'utf8',
    );
    await mkdir(join(root, 'campaigns', 'new', 'creatures'), { recursive: true });
    await writeFile(
      join(root, 'campaigns', 'new', 'creatures', `${saved.id.replace(/:/g, '_')}.json`),
      raw,
    );
    const mine = new HomebrewRepository(store, logger, campaignCreatures('new', 'New'));
    expect((await mine.list())[0]!.sourceId).toBe('campaign:new');
    expect((await mine.get(saved.id))!.sourceId).toBe('campaign:new');
  });

  it('adds one to the Library’s homebrew under its own name, still based on the stock creature', async () => {
    const creatures = new HomebrewRepository(
      store,
      logger,
      campaignCreatures('greyford', 'Greyford'),
    );
    const grik = await creatures.save({ ...creatures.copyOf(goblin), displayName: 'Grik' });
    const library = new HomebrewRepository(store, logger);
    const added = await library.adopt(grik);
    expect(added).toMatchObject({
      sourceId: 'homebrew',
      displayName: 'Grik',
      basedOn: { recordId: goblin.id, sourceId: goblin.sourceId },
    });
    expect(added.id).not.toBe(grik.id);
    expect(added.id).toMatch(/^homebrew:monster:/);
    expect((await creatures.list()).map((r) => r.id)).toEqual([grik.id]);
  });
});

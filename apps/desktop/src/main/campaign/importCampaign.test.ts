import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompendiumRecord, RecordKind } from '@trifold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IndexDb } from '../index/IndexDb';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { SourceRepository } from '../sources/repository';
import { importCampaignXml } from './importCampaign';
import { CampaignRepository } from './repository';

const FIXTURE = join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'campaign-sample.xml');
const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** A fake index that only knows what was replaced into it (the real one needs Electron). */
function fakeIndex() {
  const records: CompendiumRecord[] = [];
  const index = {
    replaceSource: vi.fn((_source: unknown, rows: Iterable<CompendiumRecord>) => {
      let n = 0;
      for (const r of rows) {
        records.push(r);
        n += 1;
      }
      return n;
    }),
    findByKey: vi.fn((kind: RecordKind, key: string) =>
      records.filter((r) => r.kind === kind && r.key === key),
    ),
  };
  return index as unknown as IndexDb;
}

let dir: string;
let store: LibraryStore;
let campaigns: CampaignRepository;
let sources: SourceRepository;
let index: IndexDb;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-campimport-'));
  store = await LibraryStore.open(join(dir, 'Library'));
  campaigns = new CampaignRepository(store, logger);
  sources = new SourceRepository(store, logger);
  index = fakeIndex();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('importCampaignXml', () => {
  it('creates a campaign with PCs, NPCs, notes, adventures, encounters and inline stat blocks', async () => {
    const report = await importCampaignXml(
      { store, sources, index, campaigns, logger },
      FIXTURE,
      'new',
    );
    expect(report).toMatchObject({
      name: 'Sample One-Shot',
      mode: 'new',
      counts: { pcs: 2, npcs: 2, notes: 4, adventures: 1, encounters: 2, statBlocks: 1 },
    });
    // Goblins are not in this Library's index, so they become custom combatants.
    expect(report.unresolved).toEqual(['Goblin Warrior [5.5e]']);

    const bundle = await campaigns.bundle();
    expect(bundle.campaign.name).toBe('Sample One-Shot');
    expect(bundle.pcs.map((p) => [p.name, p.maxHp, p.ac])).toEqual([
      ['Thora', 44, 18],
      ['Zed', 28, 12],
    ]);
    expect(bundle.npcs.map((n) => n.name)).toEqual(['Keep Warden', 'Old Marla']);
    expect(bundle.npcs[0]?.recordRef?.key).toBe('keep warden');
    expect(bundle.npcs[1]?.recordRef).toBeUndefined();
    expect(bundle.notes.map((n) => n.title).sort()).toEqual([
      'Campaign description',
      'Items from import',
      'Read-aloud: the gate',
      'Rumours',
    ]);
    expect(bundle.adventures[0]).toMatchObject({ name: 'The Sunken Keep', order: 0 });
    expect(bundle.adventures[0]?.encounterIds).toHaveLength(1);
    expect(bundle.adventures[0]?.noteIds).toHaveLength(1);

    const chamber = bundle.encounters.find((e) => e.name === "Warden's chamber")!;
    const refs = chamber.combatants.map(
      (t) => `${t.ref.kind}:${t.ref.name}${t.label ? `/${t.label}` : ''}x${t.quantity}`,
    );
    expect(refs).toEqual([
      'record:Keep Wardenx1',
      'custom:Goblin Warrior [5.5e]/Archersx3',
      'npc:Old Marlax1',
    ]);
    expect(chamber.combatants[0]?.cache).toMatchObject({ cr: '1', xp: 200, hp: 27, ac: 15 });
    const gate = bundle.encounters.find((e) => e.name === 'Gate guards')!;
    expect(gate.combatants.map((t) => t.ref.kind)).toEqual(['custom', 'pc']);

    const sourceList = await sources.list();
    expect(sourceList).toHaveLength(1);
    expect(sourceList[0]?.name).toBe('Sample One-Shot (campaign file)');
    expect(sourceList[0]?.recordCounts.monster).toBe(1);
  });

  it('merges PCs by name into the open campaign', async () => {
    await campaigns.create('Existing');
    await campaigns.quickAdd('Thora, Sam, Fighter 4, 30, 17, +1, 30, 11');
    const report = await importCampaignXml(
      { store, sources, index, campaigns, logger },
      FIXTURE,
      'merge',
    );
    expect(report.mode).toBe('merge');
    const bundle = await campaigns.bundle();
    expect(bundle.campaign.name).toBe('Existing');
    expect(bundle.pcs.map((p) => [p.name, p.level, p.maxHp])).toEqual([
      ['Thora', 5, 44],
      ['Zed', 5, 28],
    ]);
  });

  it('rejects a compendium file', async () => {
    const compendium = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'fixtures',
      'compendium-sample.xml',
    );
    await expect(
      importCampaignXml({ store, sources, index, campaigns, logger }, compendium, 'new'),
    ).rejects.toThrow(/not a campaign XML/);
  });
});

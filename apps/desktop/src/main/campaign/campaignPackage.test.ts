import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCompendiumXml } from '@trifold/importers';
import {
  CampaignExportOptions,
  defaultLibrarySettings,
  nowIso,
  type CompendiumRecord,
  type MonsterRecord,
  type RecordRef,
} from '@trifold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupService } from '../backups';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { HomebrewRepository } from '../sources/homebrew';
import { CampaignPackager } from './campaignPackage';
import { CampaignRepository } from './repository';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fixture = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml'),
  'utf8',
);
const { records } = parseCompendiumXml(fixture, { sourceId: 'src', defaultEdition: '2014' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

interface Library {
  root: string;
  store: LibraryStore;
  campaigns: CampaignRepository;
  homebrew: HomebrewRepository;
  packager: CampaignPackager;
}

async function library(known: (ref: RecordRef) => boolean = () => false): Promise<Library> {
  const root = await mkdtemp(join(tmpdir(), 'trifold-package-'));
  const store = await LibraryStore.open(root);
  const campaigns = new CampaignRepository(store, logger);
  const homebrew = new HomebrewRepository(store, logger);
  const backups = new BackupService(store, logger);
  const packager = new CampaignPackager({
    store,
    campaigns,
    homebrew,
    backups,
    logger,
    appVersion: '0.0.0-test',
    hasRecord: known,
  });
  return { root, store, campaigns, homebrew, packager };
}

const options = (patch: Partial<CampaignExportOptions> = {}) => CampaignExportOptions.parse(patch);

describe('CampaignPackager', () => {
  let a: Library;
  let b: Library;
  let out: string;
  let campaignId: string;
  let wolf: CompendiumRecord;

  /** Sunken Keep in Library A: a hurt PC, a dead NPC with a homebrew stat block, a map. */
  beforeEach(async () => {
    a = await library();
    b = await library((ref) => ref.sourceId === 'src');
    out = await mkdtemp(join(tmpdir(), 'trifold-exports-'));
    wolf = await a.homebrew.duplicate(goblin);
    const bundle = await a.campaigns.create('Sunken Keep');
    campaignId = bundle.campaign.id;
    const slug = bundle.campaign.slug;
    await mkdir(join(a.root, 'campaigns', slug, 'tokens'), { recursive: true });
    await writeFile(join(a.root, 'campaigns', slug, 'tokens', 'thora.png'), 'png-thora');
    await writeFile(join(a.root, 'campaigns', slug, 'images', 'bridge.png'), 'png-bridge');
    await a.campaigns.savePc({
      schemaVersion: 1,
      id: 'PC1',
      name: 'Thora',
      playerName: '',
      classText: '',
      level: 3,
      maxHp: 30,
      currentHp: 9,
      ac: 15,
      initiativeBonus: 2,
      speed: 30,
      passives: { perception: 12, insight: 10, investigation: 10 },
      saves: {},
      notes: '',
      portrait: 'tokens/thora.png',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    const ref = (r: CompendiumRecord): RecordRef => ({
      recordId: r.id,
      sourceId: r.sourceId,
      key: r.key,
      edition: r.edition,
    });
    await a.campaigns.writeEntity('npcs', 'NPC1', {
      schemaVersion: 1,
      id: 'NPC1',
      name: 'Varis',
      recordRef: ref(wolf),
      role: '',
      location: '',
      notes: '',
      isAlive: false,
      hp: { current: 0, max: 7, temp: 0 },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await a.campaigns.saveEncounter({
      schemaVersion: 1,
      id: 'ENC1',
      name: 'Bridge ambush',
      combatants: [
        { id: 't1', ref: { kind: 'record', ref: ref(goblin), name: 'Goblin' }, quantity: 2 },
      ] as never,
      notes: '',
      state: null,
      results: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await a.campaigns.writeEntity('scenes', 'SCN1', {
      schemaVersion: 1,
      id: 'SCN1',
      kind: 'map',
      title: 'Bridge',
      image: { path: 'images/bridge.png', displayPath: 'images/bridge.png', width: 10, height: 10 },
      audio: { playlistId: 'PL1', ambienceIds: [] },
      tokens: [
        {
          id: 'tok',
          kind: 'creature',
          ref: { kind: 'npc', npcId: 'NPC1', name: 'Varis' },
          label: 'Varis',
          x: 3,
          y: 4,
          dead: true,
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await a.store.updateSettings({
      workspace: {
        ...defaultLibrarySettings().workspace,
        consoles: {
          [slug]: {
            stage: { groups: [{ tabs: ['encounters'], active: 'encounters' }] },
            dock: { state: 'narrow' },
          },
        } as never,
      },
    });
  });

  afterEach(async () => {
    for (const dir of [a.root, b.root, out]) await rm(dir, { recursive: true, force: true });
  });

  it('previews what an export carries and leaves out', async () => {
    expect(await a.packager.preview(campaignId, options())).toEqual({
      pcs: 1,
      homebrew: 1,
      importedRecords: 1,
    });
    expect((await a.packager.preview(campaignId, options({ party: false }))).pcs).toBe(0);
  });

  it('moves a campaign in progress to another Library as it is', async () => {
    const file = join(out, 'keep.trifold-campaign');
    await a.packager.exportTo(campaignId, options(), file);
    const info = await b.packager.inspect(file);
    expect(info.problem).toBeNull();
    expect(info.existing).toBeNull();
    expect(info.manifest?.campaign).toMatchObject({ name: 'Sunken Keep', pcs: 1 });

    const result = await b.packager.importFrom(file, 'new');
    expect(result).toMatchObject({ mode: 'new', homebrewAdded: 1, homebrewKept: 0, unresolved: 0 });
    const imported = await b.campaigns.bundleOf(result.campaign.slug);
    expect(imported.campaign.id).toBe(campaignId);
    expect(imported.pcs[0]).toMatchObject({ name: 'Thora', currentHp: 9 });
    expect(imported.npcs[0]).toMatchObject({ isAlive: false, hp: { current: 0 } });
    expect(imported.scenes[0]!.tokens[0]).toMatchObject({ x: 3, y: 4, dead: true });
    // Music belongs to the other Library.
    expect(imported.scenes[0]).not.toHaveProperty('audio');
    const dir = join(b.root, 'campaigns', result.campaign.slug);
    expect(await readFile(join(dir, 'images', 'bridge.png'), 'utf8')).toBe('png-bridge');
    expect(await readFile(join(dir, 'tokens', 'thora.png'), 'utf8')).toBe('png-thora');
    expect(await b.homebrew.get(wolf.id)).toMatchObject({ displayName: wolf.displayName });
    // The layout stays behind unless asked for.
    expect(b.store.getSettings().workspace.consoles[result.campaign.slug]).toBeUndefined();
  });

  it('makes a fresh start for a new group, without the party or its pictures', async () => {
    const file = join(out, 'fresh.trifold-campaign');
    await a.packager.exportTo(
      campaignId,
      options({ state: 'fresh', party: false, layout: true }),
      file,
    );
    const result = await b.packager.importFrom(file, 'new');
    const imported = await b.campaigns.bundleOf(result.campaign.slug);
    expect(imported.pcs).toEqual([]);
    expect(imported.npcs[0]!.isAlive).toBe(true);
    expect(imported.npcs[0]).not.toHaveProperty('hp');
    expect(imported.scenes[0]!.tokens[0]).toMatchObject({ x: 3, y: 4, dead: false });
    const dir = join(b.root, 'campaigns', result.campaign.slug);
    expect(await readdir(join(dir, 'tokens'))).toEqual([]);
    expect(b.store.getSettings().workspace.consoles[result.campaign.slug]).toBeDefined();
  });

  it('never bundles imported sources and counts what the other Library lacks', async () => {
    const file = join(out, 'keep.trifold-campaign');
    await a.packager.exportTo(campaignId, options({ homebrew: false }), file);
    const names = await import('../backups').then((m) => m.readZipSummary(file));
    expect(names.names.some((n) => n.startsWith('sources/'))).toBe(false);
    expect(names.names.some((n) => n.startsWith('homebrew/'))).toBe(false);
    // Library A does not know the imported goblin's source, nor (homebrew off) the wolf here.
    const c = await library();
    try {
      const result = await c.packager.importFrom(file, 'new');
      expect(result.unresolved).toBe(2);
    } finally {
      await rm(c.root, { recursive: true, force: true });
    }
  });

  it('asks before touching a campaign the Library already has: replace or copy', async () => {
    const file = join(out, 'keep.trifold-campaign');
    await a.packager.exportTo(campaignId, options({ state: 'fresh' }), file);
    const info = await a.packager.inspect(file);
    expect(info.existing).toMatchObject({ id: campaignId, name: 'Sunken Keep' });
    await expect(a.packager.importFrom(file, 'new')).rejects.toThrow(/replace it or import a copy/);

    const copy = await a.packager.importFrom(file, 'copy');
    expect(copy.campaign.id).not.toBe(campaignId);
    expect(copy.campaign.name).toBe('Sunken Keep (copy)');
    // Slugs drop bracketed text, as every normalizeKey does: the copy gets the next free one.
    expect(copy.campaign.slug).toBe('sunken-keep-2');
    const copied = await a.campaigns.bundleOf(copy.campaign.slug);
    expect(copied.pcs[0]!.id).not.toBe('PC1');
    expect(copied.scenes[0]!.tokens[0]!.ref).toMatchObject({ npcId: copied.npcs[0]!.id });

    // Replace: the same campaign, now in its fresh state, after a safety backup.
    const replaced = await a.packager.importFrom(file, 'replace');
    expect(replaced.safety).toMatch(/-pre-restore\.zip$/);
    expect(replaced.campaign.id).toBe(campaignId);
    const after = await a.campaigns.bundleOf(replaced.campaign.slug);
    expect(after.pcs[0]).not.toHaveProperty('currentHp');
    expect((await a.campaigns.list()).map((c) => c.name).sort()).toEqual([
      'Sunken Keep',
      'Sunken Keep (copy)',
    ]);
  });

  it('keeps the Library’s own homebrew when an import carries a different version', async () => {
    const file = join(out, 'keep.trifold-campaign');
    await a.packager.exportTo(campaignId, options(), file);
    const theirs = { ...wolf, displayName: 'Our own wolf' };
    await b.store.writeJson(`homebrew/${wolf.id.replace(/:/g, '_')}.json`, theirs);
    const result = await b.packager.importFrom(file, 'new');
    expect(result).toMatchObject({ homebrewAdded: 0, homebrewKept: 1 });
    expect((await b.homebrew.get(wolf.id))?.displayName).toBe('Our own wolf');
  });

  it('refuses a Library backup or a foreign file before writing anything', async () => {
    const backups = new BackupService(a.store, logger);
    const zip = await backups.create('manual');
    const info = await b.packager.inspect(join(a.root, 'backups', zip!.name));
    expect(info.problem).toMatch(/Library backup/);
    await expect(b.packager.importFrom(join(a.root, 'backups', zip!.name), 'new')).rejects.toThrow(
      /Library backup/,
    );
    expect(await b.campaigns.list()).toEqual([]);
  });
});

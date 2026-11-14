import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCompendiumXml } from '@trifold/importers';
import {
  CAMPAIGN_SCHEMA_VERSION,
  type MonsterRecord,
  type NPC,
  type Source,
} from '@trifold/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignEntities } from '../campaign/entities';
import { CampaignRepository } from '../campaign/repository';
import type { IndexDb } from '../index/IndexDb';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import {
  bringStatBlock,
  canLimitToCampaigns,
  isCampaignFileSource,
  linkCampaignFileSources,
  shareUsedSources,
  sourceShowsIn,
} from './campaignScope';
import { campaignCreatures, HomebrewRepository } from './homebrew';
import { SourceRepository } from './repository';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fixture = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'compendium-sample.xml'),
  'utf8',
);
const { records } = parseCompendiumXml(fixture, { sourceId: 'file-a', defaultEdition: '2014' });
const goblin = records.find(
  (r): r is MonsterRecord => r.kind === 'monster' && r.name === 'Goblin Warrior [5.5e]',
)!;

function source(id: string, name: string, extra: Partial<Source> = {}): Source {
  return {
    schemaVersion: 1,
    id,
    name,
    kind: 'xml',
    enabled: true,
    defaultEdition: '2014',
    edition2024Books: [],
    license: { nonSrd: true, attribution: null },
    importedAt: new Date().toISOString(),
    importerVersion: 0,
    recordCounts: {},
    warnings: [],
    ...extra,
  };
}

function npcUsing(name: string, sourceId: string): NPC {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    id: '',
    name,
    role: '',
    location: '',
    notes: '',
    isAlive: true,
    recordRef: { recordId: `${sourceId}:monster:1`, sourceId, key: 'x', edition: '2014' },
    createdAt: '',
    updatedAt: '',
  } as NPC;
}

describe('which sources a campaign sees (ADR 0036)', () => {
  const view = { id: 'C1', sourceId: 'campaign:one' };

  it('shows sources for every campaign, limited ones only in theirs, creatures only at home', () => {
    expect(sourceShowsIn({ id: 'srd', kind: 'srd' }, view)).toBe(true);
    expect(sourceShowsIn({ id: 'f', kind: 'xml', campaignIds: null }, view)).toBe(true);
    expect(sourceShowsIn({ id: 'f', kind: 'xml', campaignIds: ['C1', 'C2'] }, view)).toBe(true);
    expect(sourceShowsIn({ id: 'f', kind: 'xml', campaignIds: ['C2'] }, view)).toBe(false);
    expect(sourceShowsIn({ id: 'campaign:one', kind: 'campaign' }, view)).toBe(true);
    expect(sourceShowsIn({ id: 'campaign:two', kind: 'campaign' }, view)).toBe(false);
  });

  it('knows a campaign file’s stat blocks and which sources can be limited', () => {
    expect(isCampaignFileSource({ kind: 'xml', name: 'Silt Springs (campaign file)' })).toBe(true);
    expect(isCampaignFileSource({ kind: 'xml', name: 'My monsters' })).toBe(false);
    expect(canLimitToCampaigns({ kind: 'xml' }, false)).toBe(true);
    expect(canLimitToCampaigns({ kind: 'srd' }, true)).toBe(false);
    expect(canLimitToCampaigns({ kind: 'homebrew' }, false)).toBe(false);
    expect(canLimitToCampaigns({ kind: 'campaign' }, false)).toBe(false);
  });
});

describe('linking and sharing sources on disk', () => {
  let root: string;
  let store: LibraryStore;
  let sources: SourceRepository;
  let campaigns: CampaignRepository;
  const index = { setSourceCampaigns: vi.fn() } as unknown as IndexDb;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'trifold-scope-'));
    store = await LibraryStore.open(root);
    sources = new SourceRepository(store, logger);
    campaigns = new CampaignRepository(store, logger);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('limits an older campaign file to the campaigns using it, once', async () => {
    const a = await campaigns.create('Silt Springs');
    await new CampaignEntities(campaigns).saveNpc(npcUsing('Wight', 'file-a'));
    await campaigns.create('Greyford');
    await sources.write(source('file-a', 'Silt Springs (campaign file)'));
    await sources.write(source('file-b', 'Old One-Shot (campaign file)'));
    await sources.write(source('mine', 'My monsters'));

    const ctx = { store, sources, index, logger };
    expect(await linkCampaignFileSources(ctx, await campaigns.list())).toBe(2);
    const byId = new Map((await sources.list()).map((s) => [s.id, s]));
    expect(byId.get('file-a')?.campaignIds).toEqual([a.campaign.id]);
    // Used by no campaign: shown in every one, and not asked again.
    expect(byId.get('file-b')?.campaignIds).toBeNull();
    // An ordinary file is never limited by this.
    expect(byId.get('mine')?.campaignIds).toBeUndefined();
    expect(index.setSourceCampaigns).toHaveBeenCalledWith('file-a', [a.campaign.id]);
    expect(await linkCampaignFileSources(ctx, await campaigns.list())).toBe(0);
  });

  it('shows a limited source in a campaign that comes in using it', async () => {
    const a = await campaigns.create('Silt Springs');
    const b = await campaigns.create('Silt Springs copy');
    await new CampaignEntities(campaigns).saveNpc(npcUsing('Wight', 'file-a'));
    await sources.write(
      source('file-a', 'Silt Springs (campaign file)', { campaignIds: [a.campaign.id] }),
    );
    await sources.write(
      source('other', 'Elsewhere (campaign file)', { campaignIds: [a.campaign.id] }),
    );

    const summary = (await campaigns.list()).find((c) => c.id === b.campaign.id)!;
    await shareUsedSources({ store, sources, index, logger }, summary);
    const byId = new Map((await sources.list()).map((s) => [s.id, s]));
    expect(byId.get('file-a')?.campaignIds).toEqual([a.campaign.id, b.campaign.id]);
    expect(byId.get('other')?.campaignIds).toEqual([a.campaign.id]);
  });

  it('brings an NPC’s stat block along when this campaign cannot see it, once', async () => {
    const b = await campaigns.create('Greyford');
    const creatures = new HomebrewRepository(
      store,
      logger,
      campaignCreatures(b.campaign.slug, b.campaign.name),
    );
    const view = { id: b.campaign.id, sourceId: creatures.sourceId };
    const ctx = {
      index: { get: (id: string) => (id === goblin.id ? goblin : null) },
      sourceOf: async (id: string) =>
        id === 'file-a'
          ? source('file-a', 'Silt Springs (campaign file)', { campaignIds: ['A'] })
          : null,
      creatures,
      view,
    };
    const ref = {
      recordId: goblin.id,
      sourceId: 'file-a',
      key: goblin.key,
      edition: goblin.edition,
    };

    const first = await bringStatBlock({ name: 'Grik', recordRef: ref }, ctx);
    expect(first.copied).toBe(true);
    expect(first.value.recordRef?.sourceId).toBe(creatures.sourceId);
    expect(first.value.recordRef?.recordId).toMatch(/^creature:monster:/);
    const [copy] = await creatures.list();
    expect(copy?.displayName).toBe(goblin.displayName);

    // A second NPC with the same stat block shares the copy.
    const second = await bringStatBlock({ name: 'Grak', recordRef: ref }, ctx);
    expect(second.copied).toBe(false);
    expect(second.value.recordRef?.recordId).toBe(copy?.id);
    expect(await creatures.list()).toHaveLength(1);

    // Visible, missing or absent stat blocks are left alone.
    const shared = { ...ctx, sourceOf: async () => source('file-a', 'x', { campaignIds: null }) };
    const kept = { name: 'Grik', recordRef: ref };
    expect((await bringStatBlock(kept, shared)).value).toBe(kept);
    const gone = { name: 'Nobody', recordRef: { ...ref, recordId: 'missing' } };
    expect((await bringStatBlock(gone, ctx)).value).toBe(gone);
    const plain: { name: string; recordRef?: typeof ref } = { name: 'Marla' };
    expect((await bringStatBlock(plain, ctx)).value).toBe(plain);
  });
});

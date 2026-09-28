import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { CampaignRepository } from './repository';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let dir: string;
let store: LibraryStore;
let repo: CampaignRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-campaign-'));
  store = await LibraryStore.open(join(dir, 'Library'));
  repo = new CampaignRepository(store, logger);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('CampaignRepository', () => {
  it('creates a campaign folder with the layout and opens it', async () => {
    const bundle = await repo.create('The Sunken Keep');
    expect(bundle.campaign).toMatchObject({
      name: 'The Sunken Keep',
      slug: 'the-sunken-keep',
      preferredEdition: '2024',
    });
    const entries = await readdir(store.resolvePath('campaigns/the-sunken-keep'));
    for (const folder of [
      'pcs',
      'encounters',
      'scenes',
      'notes',
      'npcs',
      'images',
      'tokens',
      'adventures',
    ]) {
      expect(entries).toContain(folder);
    }
    expect(store.getSettings().lastOpenCampaignSlug).toBe('the-sunken-keep');
    expect((await repo.list())[0]).toMatchObject({
      name: 'The Sunken Keep',
      pcCount: 0,
      encounterCount: 0,
    });
  });

  it('gives duplicate names distinct slugs', async () => {
    await repo.create('Test');
    const second = await repo.create('Test');
    expect(second.campaign.slug).toBe('test-2');
  });

  it('adds PCs from quick-add text and lists them in the bundle', async () => {
    await repo.create('Quick');
    const pcs = await repo.quickAdd(
      'Thora, Sam, Fighter 5, 44, 18, +1, 30, 12\nZed, , Wizard 3, 20, 12, +2',
    );
    expect(pcs.map((p) => p.name)).toEqual(['Thora', 'Zed']);
    expect(pcs[0]).toMatchObject({
      level: 5,
      maxHp: 44,
      ac: 18,
      initiativeBonus: 1,
      passives: { perception: 12 },
    });
    const bundle = await repo.bundle();
    expect(bundle.pcs.map((p) => p.name)).toEqual(['Thora', 'Zed']);
    await repo.removePc(pcs[0]!.id);
    expect((await repo.bundle()).pcs).toHaveLength(1);
  });

  it('saves encounters, combat state and results', async () => {
    await repo.create('Fights');
    const e = await repo.saveEncounter({
      schemaVersion: 1,
      id: '',
      name: 'Ambush',
      combatants: [],
      notes: '',
      state: null,
      results: [],
      createdAt: '',
      updatedAt: '',
    });
    expect(e.id).toMatch(/^[0-9A-Z]{26}$/);
    const withState = await repo.saveCombatState(e.id, {
      round: 1,
      turnIndex: 0,
      combatants: [],
      log: [],
      startedAt: '2026-09-27T00:00:00.000Z',
    });
    expect(withState.state?.round).toBe(1);
    const finished = await repo.finishEncounter(e.id, {
      endedAt: '2026-09-27T01:00:00.000Z',
      rounds: 3,
      xpEarned: 450,
      casualties: [],
      log: [],
    });
    expect(finished.state).toBeNull();
    expect(finished.results).toHaveLength(1);
    expect((await repo.list())[0]?.encounterCount).toBe(1);
  });

  it('reopens the last campaign and closes it', async () => {
    const created = await repo.create('Persist');
    const again = new CampaignRepository(store, logger);
    expect((await again.reopenLast())?.campaign.id).toBe(created.campaign.id);
    await again.close();
    expect(store.getSettings().lastOpenCampaignSlug).toBeNull();
    expect(await again.reopenLast()).toBeNull();
  });
});

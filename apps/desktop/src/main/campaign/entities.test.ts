import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@trifold/schema';
import { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { CampaignEntities } from './entities';
import { CampaignRepository } from './repository';

const logger: Logger = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let dir: string;
let repo: CampaignRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trifold-entities-'));
  repo = new CampaignRepository(await LibraryStore.open(join(dir, 'Library')), logger);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('CampaignEntities scenes', () => {
  it('keeps a map’s background variants through save and reopen', async () => {
    const bundle = await repo.create('Mill');
    const day = { path: 'images/d.png', displayPath: 'images/d.jpg', width: 1400, height: 1000 };
    const night = { ...day, path: 'images/n.png', displayPath: 'images/n.jpg' };
    const now = '2026-09-28T00:00:00.000Z';
    const saved = await new CampaignEntities(repo).saveScene({
      schemaVersion: 1,
      id: '',
      kind: 'map',
      title: 'Old mill',
      image: night,
      backgrounds: [
        { id: 'b1', name: 'Day', image: day },
        { id: 'b2', name: 'Night', image: night },
      ],
      activeBackgroundId: 'b2',
      createdAt: now,
      updatedAt: now,
    } as Scene);
    expect(saved.backgrounds?.map((b) => b.name)).toEqual(['Day', 'Night']);

    const reopened = await repo.open(bundle.campaign.id);
    const scene = reopened.scenes.find((s) => s.id === saved.id)!;
    expect(scene.backgrounds).toHaveLength(2);
    expect(scene.activeBackgroundId).toBe('b2');
  });
});

describe('CampaignEntities notes', () => {
  const note = (id: string, title: string, createdAt: string) => ({
    schemaVersion: 1 as const,
    id,
    title,
    body: '',
    tags: [],
    links: [],
    order: 0,
    createdAt,
    updatedAt: createdAt,
  });

  it('lists notes in the order they were written, not by title', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    await entities.saveNote(note('n1', 'Zombies at the gate', '2026-09-01T10:00:00.000Z'));
    await entities.saveNote(note('n2', 'Arrival in town', '2026-09-01T10:00:01.000Z'));
    // Two notes written in the same millisecond keep their adventure's order.
    await entities.saveNote(note('n4', 'Night falls', '2026-09-01T10:00:02.000Z'));
    await entities.saveNote(note('n3', 'Market day', '2026-09-01T10:00:02.000Z'));
    await entities.saveAdventure({
      schemaVersion: 1,
      id: '',
      name: 'Act one',
      summary: '',
      sceneIds: [],
      encounterIds: [],
      noteIds: ['n4', 'n3'],
      order: 0,
      createdAt: '',
      updatedAt: '',
    });

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => n.title)).toEqual([
      'Zombies at the gate',
      'Arrival in town',
      'Night falls',
      'Market day',
    ]);
  });

  it('adds a new note at the end, even after older notes that share order 0', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    await entities.saveNote(note('n1', 'Zombies at the gate', '2026-09-01T10:00:00.000Z'));
    await entities.saveNote(note('n2', 'Arrival in town', '2026-09-01T10:00:01.000Z'));
    const added = await entities.saveNote(note('', 'Aftermath', ''));
    expect(added.order).toBe(1);

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => n.title)).toEqual([
      'Zombies at the gate',
      'Arrival in town',
      'Aftermath',
    ]);
  });

  it('keeps its order when an existing note is edited', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    const first = await entities.saveNote(note('', 'First', ''));
    await entities.saveNote(note('', 'Second', ''));
    await entities.saveNote({ ...first, title: 'First, revised', body: 'More detail.' });

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => [n.title, n.body])).toEqual([
      ['First, revised', 'More detail.'],
      ['Second', ''],
    ]);
  });

  it('reorders notes, renumbering ones that shared an order, and keeps it on reopen', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    await entities.saveNote(note('n1', 'One', '2026-09-01T10:00:00.000Z'));
    await entities.saveNote(note('n2', 'Two', '2026-09-01T10:00:01.000Z'));
    await entities.saveNote(note('n3', 'Three', '2026-09-01T10:00:02.000Z'));

    const listed = await entities.reorderNotes(['n3', 'n1']);
    expect(listed.map((n) => [n.id, n.order])).toEqual([
      ['n3', 0],
      ['n1', 1],
      // Not named, so it keeps its place after the named ones.
      ['n2', 2],
    ]);

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => n.id)).toEqual(['n3', 'n1', 'n2']);
  });
});

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

  it('removing a folder lifts its scenes up to the folder’s parent', async () => {
    const bundle = await repo.create('Mill');
    const entities = new CampaignEntities(repo);
    const now = '2026-09-28T00:00:00.000Z';
    const scene = (title: string, kind: Scene['kind'], parentId: string | null, order: number) =>
      ({
        schemaVersion: 1,
        id: '',
        kind,
        title,
        subtitle: '',
        showTitleOverride: null,
        parentId,
        order,
        notes: '',
        tokens: [],
        entryMarkers: [],
        playerCamera: { mode: 'fitMap', x: 0, y: 0, zoom: 1 },
        createdAt: now,
        updatedAt: now,
      }) as Scene;
    const act = await entities.saveScene(scene('Act one', 'folder', null, 0));
    const after = await entities.saveScene(scene('Epilogue', 'title', null, 1));
    const gate = await entities.saveScene(scene('Gate', 'title', act.id, 0));
    const hall = await entities.saveScene(scene('Hall', 'title', act.id, 1));

    await entities.removeScene(act.id);

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.scenes.map((s) => [s.title, s.parentId, s.order])).toEqual([
      ['Epilogue', null, after.order],
      ['Gate', null, 2],
      ['Hall', null, 3],
    ]);
    expect(reopened.scenes.map((s) => s.id)).toEqual([after.id, gate.id, hall.id]);
  });
});

describe('CampaignEntities notes', () => {
  const note = (id: string, title: string, createdAt: string) => ({
    schemaVersion: 1 as const,
    id,
    kind: 'note' as const,
    title,
    body: '',
    tags: [],
    links: [],
    parentId: null,
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

  it('moves a note to a place in a folder, renumbering notes that shared an order, and keeps it on reopen', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    await entities.saveNote(note('n1', 'One', '2026-09-01T10:00:00.000Z'));
    await entities.saveNote(note('n2', 'Two', '2026-09-01T10:00:01.000Z'));
    await entities.saveNote(note('n3', 'Three', '2026-09-01T10:00:02.000Z'));
    const folder = await entities.saveNote({ ...note('', 'Act one', ''), kind: 'folder' });

    const listed = await entities.moveNote('n3', null, 0);
    expect(listed.map((n) => [n.id, n.order])).toEqual([
      ['n3', 0],
      ['n1', 1],
      ['n2', 2],
      [folder.id, 3],
    ]);
    const inside = await entities.moveNote('n1', folder.id, 0);
    expect(inside.find((n) => n.id === 'n1')).toMatchObject({ parentId: folder.id, order: 0 });
    // A folder can't go into itself: nothing changes.
    expect(await entities.moveNote(folder.id, folder.id, 0)).toEqual(inside);

    // The list is read by order, then creation time, across folders.
    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => [n.id, n.parentId, n.order])).toEqual([
      ['n1', folder.id, 0],
      ['n3', null, 0],
      ['n2', null, 2],
      [folder.id, null, 3],
    ]);
  });

  it('numbers a new note after its siblings in the folder, not the whole list', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    await entities.saveNote({ ...note('', 'Root one', ''), order: 0 });
    await entities.saveNote({ ...note('', 'Root two', ''), order: 0 });
    const folder = await entities.saveNote({ ...note('', 'Act one', ''), kind: 'folder' });
    const inside = await entities.saveNote({ ...note('', 'Gate', ''), parentId: folder.id });
    expect(folder.order).toBe(2);
    expect(inside).toMatchObject({ parentId: folder.id, order: 0 });

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.find((n) => n.id === inside.id)?.parentId).toBe(folder.id);
  });

  it('removing a folder lifts its contents up a level by default', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    const folder = await entities.saveNote({ ...note('', 'Act one', ''), kind: 'folder' });
    const after = await entities.saveNote(note('', 'Epilogue', ''));
    const gate = await entities.saveNote({ ...note('', 'Gate', ''), parentId: folder.id });
    const hall = await entities.saveNote({ ...note('', 'Hall', ''), parentId: folder.id });

    await entities.removeNote(folder.id);

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => [n.title, n.parentId, n.order])).toEqual([
      ['Epilogue', null, after.order],
      ['Gate', null, 2],
      ['Hall', null, 3],
    ]);
    expect(reopened.notes.map((n) => n.id)).toEqual([after.id, gate.id, hall.id]);
  });

  it('removing a folder with its contents takes nested folders too', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    const folder = await entities.saveNote({ ...note('', 'Act one', ''), kind: 'folder' });
    const sub = await entities.saveNote({
      ...note('', 'Keep', ''),
      kind: 'folder',
      parentId: folder.id,
    });
    await entities.saveNote({ ...note('', 'Gate', ''), parentId: sub.id });
    await entities.saveNote(note('', 'Epilogue', ''));

    await entities.removeNote(folder.id, 'delete');

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.map((n) => n.title)).toEqual(['Epilogue']);
  });
});

describe('captureNote (ADR 0018)', () => {
  it('makes the Quick Notes folder once, files captures in it, and makes it again after a delete', async () => {
    const bundle = await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    // Two captures at once still share one folder.
    const [first, second] = await Promise.all([
      entities.captureNote({ title: '  Guard  took the bribe ', body: 'Owes us one.' }),
      entities.captureNote({ title: 'Map in the cellar', body: '' }),
    ]);
    expect(first.folder.id).toBe(second.folder.id);
    expect(first.folder).toMatchObject({
      kind: 'folder',
      title: 'Quick Notes',
      role: 'quickNotes',
    });
    expect(first.note).toMatchObject({
      title: 'Guard took the bribe',
      body: 'Owes us one.',
      parentId: first.folder.id,
    });
    expect(first.note.capture?.at).toBe(first.note.createdAt);
    expect(second.note.order).toBe(first.note.order + 1);

    // Renamed, it is still the folder; deleted with its contents, the next capture makes a new one.
    await entities.saveNote({ ...first.folder, title: 'Loose ends' });
    const third = await entities.captureNote({ title: 'Third', body: '' });
    expect(third.folder.id).toBe(first.folder.id);
    await entities.removeNote(first.folder.id, 'delete');
    const fourth = await entities.captureNote({ title: 'Fourth', body: '' });
    expect(fourth.folder.id).not.toBe(first.folder.id);

    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.notes.filter((n) => n.role === 'quickNotes')).toHaveLength(1);
    expect(reopened.notes.find((n) => n.id === fourth.note.id)?.parentId).toBe(fourth.folder.id);
  });

  it('refuses a blank title and keeps working after', async () => {
    await repo.create('Chronicle');
    const entities = new CampaignEntities(repo);
    await expect(entities.captureNote({ title: ' ', body: 'x' })).rejects.toThrow(
      'A quick note needs a title',
    );
    await expect(entities.captureNote({ title: 'Fine', body: '' })).resolves.toBeTruthy();
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampaignCounter, CampaignTimer, PinnedRoll, Scene } from '@trifold/schema';
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

describe('counters (ADR 0019)', () => {
  const now = '2026-11-10T00:00:00.000Z';
  const draft = (name: string, over: Partial<CampaignCounter> = {}): CampaignCounter => ({
    schemaVersion: 1,
    id: '',
    name,
    initial: 3,
    value: 3,
    step: 5,
    order: 0,
    createdAt: '',
    updatedAt: now,
    ...over,
  });

  it('saves counters in order, clamps the value, and keeps them through a restart', async () => {
    const bundle = await repo.create('Keep');
    expect(bundle.counters).toEqual([]);
    const entities = new CampaignEntities(repo);
    const torches = await entities.saveCounter(draft('Torches'));
    const lr = await entities.saveCounter(draft('Legendary resistance', { min: 0, max: 3 }));
    expect([torches.order, lr.order]).toEqual([0, 1]);
    expect(torches.id).not.toBe('');

    // A value past a bound is held at it; editing keeps the counter's place.
    const pushed = await entities.saveCounter({ ...lr, value: 9 });
    expect(pushed).toMatchObject({ value: 3, order: 1 });
    await entities.saveCounter({ ...torches, value: -2 });

    // A fresh store and repository read the files the way a restarted app would.
    const restarted = new CampaignRepository(await LibraryStore.open(join(dir, 'Library')), logger);
    const reopened = await restarted.open(bundle.campaign.id);
    expect(reopened.counters.map((c) => [c.name, c.value, c.min, c.max])).toEqual([
      ['Torches', -2, undefined, undefined],
      ['Legendary resistance', 3, 0, 3],
    ]);
  });

  it('moves a counter and renumbers the list, then removes one', async () => {
    const bundle = await repo.create('Keep');
    const entities = new CampaignEntities(repo);
    const a = await entities.saveCounter(draft('A'));
    await entities.saveCounter(draft('B'));
    await entities.saveCounter(draft('C'));
    const moved = await entities.moveCounter(a.id, 2);
    expect(moved.map((c) => [c.name, c.order])).toEqual([
      ['B', 0],
      ['C', 1],
      ['A', 2],
    ]);
    await entities.removeCounter(a.id);
    const reopened = await repo.open(bundle.campaign.id);
    expect(reopened.counters.map((c) => c.name)).toEqual(['B', 'C']);
  });

  it('opens a campaign made before counters, and makes the folder on the first save', async () => {
    const bundle = await repo.create('Old');
    await rm(join(dir, 'Library', 'campaigns', bundle.campaign.slug, 'counters'), {
      recursive: true,
    });
    expect((await repo.open(bundle.campaign.id)).counters).toEqual([]);
    await new CampaignEntities(repo).saveCounter(draft('Waves'));
    expect((await repo.open(bundle.campaign.id)).counters.map((c) => c.name)).toEqual(['Waves']);
  });

  it('refuses min above max', async () => {
    await repo.create('Keep');
    await expect(
      new CampaignEntities(repo).saveCounter(draft('Bad', { min: 5, max: 2 })),
    ).rejects.toThrow();
  });
});

describe('timers (ADR 0021)', () => {
  const now = '2026-11-10T00:00:00.000Z';
  const draft = (name: string, over: Partial<CampaignTimer> = {}): CampaignTimer => ({
    schemaVersion: 1,
    id: '',
    name,
    durationSec: 60,
    chime: true,
    order: 0,
    createdAt: '',
    updatedAt: now,
    ...over,
  });

  it('saves timer definitions in order and keeps them through a restart', async () => {
    const bundle = await repo.create('Keep');
    expect(bundle.timers).toEqual([]);
    const entities = new CampaignEntities(repo);
    await entities.saveTimer(draft('Decide', { durationSec: 30 }));
    const guards = await entities.saveTimer(draft('Guards return', { durationSec: 300 }));
    await entities.saveTimer({ ...guards, chime: false, showOnTv: true });
    const restarted = new CampaignRepository(await LibraryStore.open(join(dir, 'Library')), logger);
    const reopened = await restarted.open(bundle.campaign.id);
    expect(
      reopened.timers.map((t) => [t.name, t.durationSec, t.chime, !!t.showOnTv, t.order]),
    ).toEqual([
      ['Decide', 30, true, false, 0],
      ['Guards return', 300, false, true, 1],
    ]);
  });

  it('moves and removes timers, and opens a campaign made before timers', async () => {
    const bundle = await repo.create('Old');
    await rm(join(dir, 'Library', 'campaigns', bundle.campaign.slug, 'timers'), {
      recursive: true,
    });
    expect((await repo.open(bundle.campaign.id)).timers).toEqual([]);
    const entities = new CampaignEntities(repo);
    const a = await entities.saveTimer(draft('A'));
    await entities.saveTimer(draft('B'));
    expect((await entities.moveTimer(a.id, 1)).map((t) => t.name)).toEqual(['B', 'A']);
    await entities.removeTimer(a.id);
    expect((await repo.open(bundle.campaign.id)).timers.map((t) => t.name)).toEqual(['B']);
  });

  it('refuses a duration under a second or over a day', async () => {
    await repo.create('Keep');
    const entities = new CampaignEntities(repo);
    await expect(entities.saveTimer(draft('Zero', { durationSec: 0 }))).rejects.toThrow();
    await expect(entities.saveTimer(draft('Long', { durationSec: 86_401 }))).rejects.toThrow();
  });
});

describe('pinned rolls', () => {
  const at = '2026-11-12T00:00:00.000Z';
  const draft = (over: Partial<PinnedRoll> = {}): PinnedRoll => ({
    schemaVersion: 1,
    id: '',
    name: '',
    label: '2d6+3',
    expression: '2d6+3',
    total: 10,
    faces: '2d6: 4, 3',
    kind: 'dice',
    source: 'pool',
    rolledAt: at,
    createdAt: '',
    updatedAt: at,
    ...over,
  });

  it('pins in order, names a pin after its roll until renamed, and keeps them through a restart', async () => {
    const bundle = await repo.create('Keep');
    expect(bundle.pinnedRolls).toEqual([]);
    const entities = new CampaignEntities(repo);
    const first = await entities.savePinnedRoll(draft());
    expect(first.name).toBe('2d6+3');
    await entities.savePinnedRoll(draft({ label: '1d20', total: 17, faces: '1d20: 17' }));
    await entities.savePinnedRoll({ ...first, name: '  Ogre damage  ' });
    const restarted = new CampaignRepository(await LibraryStore.open(join(dir, 'Library')), logger);
    const reopened = await restarted.open(bundle.campaign.id);
    expect(reopened.pinnedRolls.map((p) => [p.name, p.total, p.faces])).toEqual([
      ['Ogre damage', 10, '2d6: 4, 3'],
      ['1d20', 17, '1d20: 17'],
    ]);
  });

  it('unpins, and opens a campaign made before pinned rolls', async () => {
    const bundle = await repo.create('Old');
    await rm(join(dir, 'Library', 'campaigns', bundle.campaign.slug, 'pinnedRolls'), {
      recursive: true,
    });
    expect((await repo.open(bundle.campaign.id)).pinnedRolls).toEqual([]);
    const entities = new CampaignEntities(repo);
    const pin = await entities.savePinnedRoll(draft());
    expect((await repo.open(bundle.campaign.id)).pinnedRolls).toHaveLength(1);
    await entities.removePinnedRoll(pin.id);
    expect((await repo.open(bundle.campaign.id)).pinnedRolls).toEqual([]);
  });
});

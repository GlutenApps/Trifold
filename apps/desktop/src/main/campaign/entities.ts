import { rm } from 'node:fs/promises';
import { ulid } from 'ulid';
import type { NoteFolderContents } from '@trifold/api';
import {
  clampCounterValue,
  moveCounter,
  nextCounterOrder,
  placeItem,
  QUICK_NOTES_TITLE,
  quickNotesFolder,
  quickNoteTitle,
} from '@trifold/rules';
import {
  Adventure,
  CAMPAIGN_SCHEMA_VERSION,
  CampaignCounter,
  CampaignTimer,
  Note,
  NPC,
  nowIso,
  PinnedRoll,
  Session,
  Scene,
} from '@trifold/schema';
import type { CampaignRepository } from './repository';

/**
 * Adventures, notes and NPCs (DESIGN.md §5.2), one JSON file each under the campaign folder.
 * Kept separate from the repository class to keep that file focused on campaigns, PCs and
 * encounters; this module reaches the same store through the repository's helpers.
 */
/** A new note's fields before saveNote fills in the id and order. */
function blank(at: string): Note {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    id: '',
    kind: 'note',
    title: '',
    body: '',
    tags: [],
    links: [],
    parentId: null,
    order: 0,
    createdAt: at,
    updatedAt: at,
  };
}

export class CampaignEntities {
  constructor(private readonly repo: CampaignRepository) {}

  /** Captures run one after another, so two quick saves never make two Quick Notes folders. */
  private captures: Promise<unknown> = Promise.resolve();

  /**
   * A quick note (ADR 0018): an ordinary note, last in the Quick Notes folder, stamped with
   * the time it was captured. The folder is found by its role and made at the end of the root
   * when it is missing, including after the DM deleted it.
   */
  captureNote(input: { title: string; body: string }): Promise<{ note: Note; folder: Note }> {
    const run = this.captures.then(async () => {
      const title = quickNoteTitle(input.title);
      if (!title) throw new Error('A quick note needs a title');
      const folder =
        quickNotesFolder(await this.repo.notes()) ??
        (await this.saveNote({
          ...blank(nowIso()),
          kind: 'folder',
          title: QUICK_NOTES_TITLE,
          role: 'quickNotes',
        }));
      const at = nowIso();
      // saveNote gives it an id and puts it last in the folder.
      const note = await this.saveNote({
        ...blank(at),
        title,
        body: input.body,
        parentId: folder.id,
        capture: { at },
      });
      return { note, folder };
    });
    this.captures = run.catch(() => undefined);
    return run;
  }

  async saveAdventure(input: Adventure): Promise<Adventure> {
    const adventure = Adventure.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('adventures', adventure.id, adventure);
    return adventure;
  }

  async removeAdventure(id: string): Promise<void> {
    await rm(this.repo.entityPath('adventures', id), { force: true });
    await this.repo.touch();
  }

  /** Saves a note; a new one (no id) goes last among its siblings (ADR 0010). */
  async saveNote(input: Note): Promise<Note> {
    const parentId = input.parentId ?? null;
    const order = input.id
      ? input.order
      : Math.max(
          -1,
          ...(await this.repo.notes())
            .filter((n) => (n.parentId ?? null) === parentId)
            .map((n) => n.order),
        ) + 1;
    const note = Note.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      parentId,
      order,
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('notes', note.id, note);
    return note;
  }

  /**
   * Puts a note (or folder) under `parentId` at `index` among the notes there and renumbers
   * that folder from 0 (so notes that shared an `order` can't stick). A folder never goes into
   * itself. Returns the whole list in tree order.
   */
  async moveNote(id: string, parentId: string | null, index: number): Promise<Note[]> {
    const notes = await this.repo.notes();
    const changed = placeItem(notes, id, parentId, index).map((n) => ({
      ...n,
      updatedAt: nowIso(),
    }));
    if (changed.length) await this.repo.writeEntities('notes', changed);
    return changed.length ? this.repo.notes() : notes;
  }

  /**
   * Removes a note. A folder's contents move up a level (`lift`, the default) or go with it
   * (`delete`); either way nothing is left pointing at a missing folder.
   */
  async removeNote(id: string, contents: NoteFolderContents = 'lift'): Promise<void> {
    const notes = await this.repo.notes();
    const target = notes.find((n) => n.id === id);
    const children = notes.filter((n) => n.parentId === id);
    if (target && children.length) {
      if (contents === 'delete') {
        for (const child of children) await this.removeNote(child.id, 'delete');
      } else {
        const parentId = target.parentId ?? null;
        let order = Math.max(
          -1,
          ...notes.filter((n) => (n.parentId ?? null) === parentId).map((n) => n.order),
        );
        await this.repo.writeEntities(
          'notes',
          children.map((child) => ({ ...child, parentId, order: ++order, updatedAt: nowIso() })),
        );
      }
    }
    await rm(this.repo.entityPath('notes', id), { force: true });
    await this.repo.touch();
  }

  async saveNpc(input: NPC): Promise<NPC> {
    const npc = NPC.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('npcs', npc.id, npc);
    return npc;
  }

  /**
   * Copies another campaign's NPC into the open one ("From another campaign…"): a new id, no
   * carried HP and alive again (as a fresh-start export does, ADR 0015), its stat block link
   * kept and its portrait file copied across. Independent of the original afterwards.
   */
  async copyNpcFrom(campaignId: string, npcId: string): Promise<NPC> {
    const { slug, value } = await this.repo.readEntityFrom(campaignId, 'npcs', npcId, NPC, 'npc');
    const { hp: _hp, portrait, ...rest } = value;
    const copied = portrait ? await this.repo.copyAssetFrom(slug, portrait) : null;
    return this.saveNpc({
      ...rest,
      id: '',
      createdAt: '',
      isAlive: true,
      ...(copied ? { portrait: copied } : {}),
    });
  }

  async removeNpc(id: string): Promise<void> {
    await rm(this.repo.entityPath('npcs', id), { force: true });
    await this.repo.touch();
  }

  // ---------- counters (ADR 0019) ----------

  /** Saves a counter, its value clamped to its bounds; a new one (no id) goes last. */
  async saveCounter(input: CampaignCounter): Promise<CampaignCounter> {
    const order = input.id ? input.order : nextCounterOrder(await this.repo.counters());
    const counter = CampaignCounter.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      value: clampCounterValue(input.value, input),
      order,
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('counters', counter.id, counter);
    return counter;
  }

  async removeCounter(id: string): Promise<void> {
    await rm(this.repo.entityPath('counters', id), { force: true });
    await this.repo.touch();
  }

  /** Puts a counter at `index` and renumbers the list; resolves to the list in order. */
  async moveCounter(id: string, index: number): Promise<CampaignCounter[]> {
    const counters = await this.repo.counters();
    const changed = moveCounter(counters, id, index).map((c) => ({ ...c, updatedAt: nowIso() }));
    if (!changed.length) return counters;
    await this.repo.writeEntities('counters', changed);
    return this.repo.counters();
  }

  // ---------- timers (ADR 0021) ----------

  /** Saves a timer definition; a new one (no id) goes last. */
  async saveTimer(input: CampaignTimer): Promise<CampaignTimer> {
    const order = input.id ? input.order : nextCounterOrder(await this.repo.timers());
    const timer = CampaignTimer.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      order,
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('timers', timer.id, timer);
    return timer;
  }

  async removeTimer(id: string): Promise<void> {
    await rm(this.repo.entityPath('timers', id), { force: true });
    await this.repo.touch();
  }

  /** Puts a timer at `index` and renumbers the list; resolves to the list in order. */
  async moveTimer(id: string, index: number): Promise<CampaignTimer[]> {
    const timers = await this.repo.timers();
    const changed = moveCounter(timers, id, index).map((t) => ({ ...t, updatedAt: nowIso() }));
    if (!changed.length) return timers;
    await this.repo.writeEntities('timers', changed);
    return this.repo.timers();
  }

  // ---------- pinned rolls ----------

  /** Pins a roll (no id) or renames one; the result and what was rolled never change. */
  async savePinnedRoll(input: PinnedRoll): Promise<PinnedRoll> {
    const pin = PinnedRoll.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      name: input.name.trim() || input.label || 'Roll',
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('pinnedRolls', pin.id, pin);
    return pin;
  }

  async removePinnedRoll(id: string): Promise<void> {
    await rm(this.repo.entityPath('pinnedRolls', id), { force: true });
    await this.repo.touch();
  }

  // ---------- sessions (ADR 0040) ----------

  /** Starts a session (no id) or replaces one: its events, title and recap. */
  async saveSession(input: Session): Promise<Session> {
    const now = nowIso();
    const session = Session.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      startedAt: input.startedAt || now,
      lastActivityAt: input.lastActivityAt || now,
      createdAt: input.createdAt || now,
      updatedAt: now,
    });
    await this.repo.writeEntity('sessions', session.id, session);
    return session;
  }

  async removeSession(id: string): Promise<void> {
    await rm(this.repo.entityPath('sessions', id), { force: true });
    await this.repo.touch();
  }

  async saveScene(input: Scene): Promise<Scene> {
    const scene = Scene.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('scenes', scene.id, scene);
    return scene;
  }

  /**
   * Removes a scene. A folder's children move up to its parent (the same lift as notes), so
   * no scene file is left pointing at a missing folder.
   */
  async removeScene(id: string): Promise<void> {
    const scenes = await this.repo.scenes();
    const target = scenes.find((s) => s.id === id);
    const children = scenes.filter((s) => s.parentId === id);
    if (target && children.length) {
      const parentId = target.parentId ?? null;
      let order = Math.max(
        -1,
        ...scenes.filter((s) => (s.parentId ?? null) === parentId).map((s) => s.order),
      );
      await this.repo.writeEntities(
        'scenes',
        children.map((child) => ({ ...child, parentId, order: ++order, updatedAt: nowIso() })),
      );
    }
    await rm(this.repo.entityPath('scenes', id), { force: true });
    await this.repo.touch();
  }
}

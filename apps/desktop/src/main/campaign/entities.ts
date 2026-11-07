import { rm } from 'node:fs/promises';
import { ulid } from 'ulid';
import type { NoteFolderContents } from '@trifold/api';
import { placeItem } from '@trifold/rules';
import { Adventure, CAMPAIGN_SCHEMA_VERSION, Note, NPC, nowIso, Scene } from '@trifold/schema';
import type { CampaignRepository } from './repository';

/**
 * Adventures, notes and NPCs (DESIGN.md §5.2), one JSON file each under the campaign folder.
 * Kept separate from the repository class to keep that file focused on campaigns, PCs and
 * encounters; this module reaches the same store through the repository's helpers.
 */
export class CampaignEntities {
  constructor(private readonly repo: CampaignRepository) {}

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

  async removeNpc(id: string): Promise<void> {
    await rm(this.repo.entityPath('npcs', id), { force: true });
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

  async removeScene(id: string): Promise<void> {
    await rm(this.repo.entityPath('scenes', id), { force: true });
    await this.repo.touch();
  }
}

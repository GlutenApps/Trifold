import { rm } from 'node:fs/promises';
import { ulid } from 'ulid';
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

  /** Saves a note; a new one (no id) goes to the end of the list. */
  async saveNote(input: Note): Promise<Note> {
    const order = input.id
      ? input.order
      : Math.max(-1, ...(await this.repo.notes()).map((n) => n.order)) + 1;
    const note = Note.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      order,
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('notes', note.id, note);
    return note;
  }

  /**
   * Puts the notes in the order of `noteIds` and returns the whole list. Every note is renumbered
   * so notes that shared an `order` can't stick; ids not given keep their relative order after.
   */
  async reorderNotes(noteIds: readonly string[]): Promise<Note[]> {
    const notes = await this.repo.notes();
    const rank = new Map(noteIds.map((id, i) => [id, i]));
    const sorted = [...notes].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    const next = sorted.map((n, order) => ({ ...n, order }));
    const changed = next.filter((n, i) => notes.find((o) => o.id === n.id)?.order !== i);
    if (changed.length) await this.repo.writeEntities('notes', changed);
    return next;
  }

  async removeNote(id: string): Promise<void> {
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

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

  async saveNote(input: Note): Promise<Note> {
    const note = Note.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.repo.writeEntity('notes', note.id, note);
    return note;
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

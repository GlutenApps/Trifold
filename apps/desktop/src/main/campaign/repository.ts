import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { ulid } from 'ulid';
import type { ZodType } from 'zod';
import type { CampaignBundle, CampaignSummary } from '@trifold/api';
import { normalizeKey, parseQuickAdd } from '@trifold/rules';
import {
  Adventure,
  CAMPAIGN_SCHEMA_VERSION,
  Campaign,
  CombatState,
  Encounter,
  Note,
  NPC,
  nowIso,
  PCCard,
  Scene,
  type EncounterResult,
} from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';

/** Sub-folders of every campaign (DATA-FORMATS.md §5.4). */
const CAMPAIGN_LAYOUT = [
  'adventures',
  'notes',
  'npcs',
  'pcs',
  'encounters',
  'scenes',
  'images',
  'tokens',
];

function slugify(name: string): string {
  const base = normalizeKey(name).replace(/\s+/g, '-');
  return base || 'campaign';
}

/**
 * `campaigns/<slug>/` on disk: campaign.json plus one JSON file per PC card and encounter.
 * Writes go through the LibraryStore (atomic); reads validate and migrate.
 */
export class CampaignRepository {
  private currentSlug: string | null = null;

  constructor(
    private readonly store: LibraryStore,
    private readonly logger: Logger,
  ) {}

  get current(): string | null {
    return this.currentSlug;
  }

  private dir(slug: string, ...rest: string[]): string {
    return ['campaigns', slug, ...rest].join('/');
  }

  private async listDir(relative: string): Promise<string[]> {
    try {
      return await readdir(this.store.resolvePath(relative));
    } catch {
      return [];
    }
  }

  private async readAll<T>(
    relative: string,
    schema: ZodType<T>,
    kind: 'pc' | 'encounter' | 'adventure' | 'note' | 'npc' | 'scene',
  ): Promise<T[]> {
    const out: T[] = [];
    for (const file of await this.listDir(relative)) {
      if (!file.endsWith('.json')) continue;
      try {
        out.push(await this.store.readJson(`${relative}/${file}`, schema, kind));
      } catch (err) {
        this.logger.warn(
          `${relative}/${file} skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return out;
  }

  async list(): Promise<CampaignSummary[]> {
    const summaries: CampaignSummary[] = [];
    for (const slug of await this.listDir('campaigns')) {
      try {
        const info = await stat(this.store.resolvePath(this.dir(slug)));
        if (!info.isDirectory()) continue;
        const campaign = await this.store.readJson(
          this.dir(slug, 'campaign.json'),
          Campaign,
          'campaign',
        );
        const pcs = (await this.listDir(this.dir(slug, 'pcs'))).filter((f) =>
          f.endsWith('.json'),
        ).length;
        const encounters = (await this.listDir(this.dir(slug, 'encounters'))).filter((f) =>
          f.endsWith('.json'),
        ).length;
        summaries.push({
          id: campaign.id,
          name: campaign.name,
          slug: campaign.slug,
          updatedAt: campaign.updatedAt,
          pcCount: pcs,
          encounterCount: encounters,
        });
      } catch (err) {
        this.logger.warn(
          `campaign folder ${slug} skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(name: string): Promise<CampaignBundle> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('A campaign needs a name');
    const existing = new Set(await this.listDir('campaigns'));
    let slug = slugify(trimmed);
    for (let n = 2; existing.has(slug); n += 1) slug = `${slugify(trimmed)}-${n}`;
    const now = nowIso();
    const campaign = Campaign.parse({
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: ulid(),
      name: trimmed,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    await mkdir(this.store.resolvePath(this.dir(slug)), { recursive: true });
    await Promise.all(
      CAMPAIGN_LAYOUT.map((d) =>
        mkdir(this.store.resolvePath(this.dir(slug, d)), { recursive: true }),
      ),
    );
    await this.store.writeJson(this.dir(slug, 'campaign.json'), campaign);
    this.logger.info(`campaign "${trimmed}" created at campaigns/${slug}`);
    return this.open(campaign.id);
  }

  private async slugFor(campaignId: string): Promise<string> {
    for (const slug of await this.listDir('campaigns')) {
      try {
        const c = await this.store.readJson(this.dir(slug, 'campaign.json'), Campaign, 'campaign');
        if (c.id === campaignId || c.slug === campaignId) return slug;
      } catch {
        // skipped above
      }
    }
    throw new Error(`Campaign ${campaignId} not found`);
  }

  async open(campaignId: string): Promise<CampaignBundle> {
    const slug = await this.slugFor(campaignId);
    this.currentSlug = slug;
    await this.store.updateSettings({ lastOpenCampaignSlug: slug });
    return this.bundle();
  }

  async reopenLast(): Promise<CampaignBundle | null> {
    const slug = this.store.getSettings().lastOpenCampaignSlug;
    if (!slug) return null;
    try {
      return await this.open(slug);
    } catch (err) {
      this.logger.warn(
        `last campaign ${slug} could not be reopened: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async close(): Promise<void> {
    this.currentSlug = null;
    await this.store.updateSettings({ lastOpenCampaignSlug: null });
  }

  /** Deletes the campaign folder and everything in it; closes it first when it is open. */
  async remove(campaignId: string): Promise<void> {
    const slug = await this.slugFor(campaignId);
    if (this.currentSlug === slug || this.store.getSettings().lastOpenCampaignSlug === slug) {
      await this.close();
    }
    await rm(this.store.resolvePath(this.dir(slug)), { recursive: true, force: true });
    this.logger.info(`campaign folder campaigns/${slug} deleted`);
  }

  private requireSlug(): string {
    if (!this.currentSlug) throw new Error('No campaign is open');
    return this.currentSlug;
  }

  async bundle(): Promise<CampaignBundle> {
    const slug = this.requireSlug();
    const campaign = await this.store.readJson(
      this.dir(slug, 'campaign.json'),
      Campaign,
      'campaign',
    );
    const pcs = (await this.readAll(this.dir(slug, 'pcs'), PCCard, 'pc')).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const encounters = (
      await this.readAll(this.dir(slug, 'encounters'), Encounter, 'encounter')
    ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const adventures = (
      await this.readAll(this.dir(slug, 'adventures'), Adventure, 'adventure')
    ).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    // Notes read in the order they were written (for imports, the file's order). Notes saved in
    // the same millisecond fall back to their place in an adventure, then to the ULID.
    const adventureRank = new Map(adventures.flatMap((a) => a.noteIds).map((id, i) => [id, i]));
    const rank = (id: string) => adventureRank.get(id) ?? Number.MAX_SAFE_INTEGER;
    const notes = (await this.readAll(this.dir(slug, 'notes'), Note, 'note')).sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        rank(a.id) - rank(b.id) ||
        a.id.localeCompare(b.id),
    );
    const npcs = (await this.readAll(this.dir(slug, 'npcs'), NPC, 'npc')).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const scenes = (await this.readAll(this.dir(slug, 'scenes'), Scene, 'scene')).sort(
      (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
    );
    return { campaign, pcs, encounters, adventures, notes, npcs, scenes };
  }

  async updateCampaign(patch: Partial<Campaign>): Promise<Campaign> {
    const slug = this.requireSlug();
    const current = await this.store.readJson(
      this.dir(slug, 'campaign.json'),
      Campaign,
      'campaign',
    );
    const next = Campaign.parse({
      ...current,
      ...patch,
      id: current.id,
      slug: current.slug,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      updatedAt: nowIso(),
    });
    await this.store.writeJson(this.dir(slug, 'campaign.json'), next);
    return next;
  }

  async touch(): Promise<void> {
    await this.updateCampaign({});
  }

  /** Absolute path of one entity file; used by CampaignEntities for removal. */
  entityPath(folder: 'adventures' | 'notes' | 'npcs' | 'scenes', id: string): string {
    return this.store.resolvePath(this.dir(this.requireSlug(), folder, `${id}.json`));
  }

  async writeEntity(
    folder: 'adventures' | 'notes' | 'npcs' | 'scenes',
    id: string,
    value: unknown,
  ): Promise<void> {
    await this.store.writeJson(this.dir(this.requireSlug(), folder, `${id}.json`), value);
    await this.touch();
  }

  // ---------- PC cards ----------

  async savePc(input: PCCard): Promise<PCCard> {
    const slug = this.requireSlug();
    const pc = PCCard.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.store.writeJson(this.dir(slug, 'pcs', `${pc.id}.json`), pc);
    await this.touch();
    return pc;
  }

  async removePc(pcId: string): Promise<void> {
    const slug = this.requireSlug();
    await rm(this.store.resolvePath(this.dir(slug, 'pcs', `${pcId}.json`)), { force: true });
    await this.touch();
  }

  async quickAdd(text: string): Promise<PCCard[]> {
    const out: PCCard[] = [];
    for (const q of parseQuickAdd(text)) {
      const now = nowIso();
      out.push(
        await this.savePc(
          PCCard.parse({
            schemaVersion: CAMPAIGN_SCHEMA_VERSION,
            id: ulid(),
            name: q.name,
            playerName: q.playerName ?? '',
            classText: q.classText ?? '',
            level: q.level ?? 1,
            maxHp: q.maxHp ?? 10,
            ac: q.ac ?? 10,
            initiativeBonus: q.initiativeBonus ?? 0,
            speed: q.speed ?? 30,
            passives: { perception: q.passivePerception ?? 10 },
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
    }
    return out;
  }

  // ---------- encounters ----------

  async saveEncounter(input: Encounter): Promise<Encounter> {
    const slug = this.requireSlug();
    const encounter = Encounter.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    await this.store.writeJson(this.dir(slug, 'encounters', `${encounter.id}.json`), encounter);
    await this.touch();
    return encounter;
  }

  async getEncounter(encounterId: string): Promise<Encounter> {
    const slug = this.requireSlug();
    return this.store.readJson(
      this.dir(slug, 'encounters', `${encounterId}.json`),
      Encounter,
      'encounter',
    );
  }

  async removeEncounter(encounterId: string): Promise<void> {
    const slug = this.requireSlug();
    await rm(this.store.resolvePath(this.dir(slug, 'encounters', `${encounterId}.json`)), {
      force: true,
    });
    await this.touch();
  }

  async saveCombatState(encounterId: string, state: CombatState | null): Promise<Encounter> {
    const current = await this.getEncounter(encounterId);
    return this.saveEncounter({ ...current, state: state ? CombatState.parse(state) : null });
  }

  async finishEncounter(encounterId: string, result: EncounterResult): Promise<Encounter> {
    const current = await this.getEncounter(encounterId);
    return this.saveEncounter({ ...current, state: null, results: [...current.results, result] });
  }
}

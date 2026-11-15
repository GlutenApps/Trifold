import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join, posix } from 'node:path';
import { ulid } from 'ulid';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { ZodType } from 'zod';
import { addFileLazily, writeZipTo } from '../zipWrite';
import type {
  BackupManifest,
  CampaignExportPreview,
  CampaignPackageInfo,
  CampaignPackageMode,
  CampaignPackageResult,
} from '@trifold/api';
import {
  filesOnlyLeftOutPcsUse,
  homebrewIdsIn,
  HOMEBREW_SOURCE,
  importedSourceRefs,
  isBundledSource,
  prepareExport,
  recordRefsIn,
  withNewIds,
  type CampaignParts,
} from '@trifold/importers';
import {
  Adventure,
  CAMPAIGN_SCHEMA_VERSION,
  Campaign,
  CampaignCounter,
  CampaignExportOptions,
  CampaignTimer,
  PinnedRoll,
  Session,
  CompendiumRecord,
  Encounter,
  LIBRARY_SCHEMA_VERSION,
  migrate,
  Note,
  NPC,
  PCCard,
  Scene,
  ShellLayout,
  type FileKind,
  type RecordRef,
} from '@trifold/schema';
import { parseManifest, readZipSummary, type BackupService } from '../backups';
import { writeFileAtomic } from '../library/atomicWrite';
import type { LibraryStore } from '../library/LibraryStore';
import { errorMessage, type Logger } from '../log';
import {
  campaignSourceId,
  fileName as homebrewFile,
  type HomebrewRepository,
} from '../sources/homebrew';
import { CAMPAIGN_LAYOUT, type CampaignRepository } from './repository';

/**
 * Campaign export and import as `.trifold-campaign` zips (ADR 0015). Export is selection
 * (`prepareExport` in `@trifold/importers`) plus zipping; import validates and migrates every
 * file and writes it through `LibraryStore`, adding homebrew the Library lacks without
 * overwriting the DM's own copies. `CampaignPackager` below.
 */
const MANIFEST = 'manifest.json';
const LAYOUT = 'layout.json';
/** Inside the zip: the campaign folder, then homebrew records beside it. */
const ROOT = 'campaign';
/** Campaign sub-folders that hold media, copied byte for byte. */
const MEDIA = ['images', 'tokens'] as const;
/** The campaign's own creatures (ADR 0035): exported as files, imported with their ids fixed up. */
const CREATURES = 'creatures';
const RECORD_ID = /^[A-Za-z0-9:_-]+$/;

type EntityFolder =
  | 'pcs'
  | 'encounters'
  | 'adventures'
  | 'notes'
  | 'npcs'
  | 'scenes'
  | 'counters'
  | 'timers'
  | 'pinnedRolls'
  | 'sessions';
const ENTITIES: readonly { folder: EntityFolder; kind: FileKind; schema: ZodType<unknown> }[] = [
  { folder: 'pcs', kind: 'pc', schema: PCCard },
  { folder: 'encounters', kind: 'encounter', schema: Encounter },
  { folder: 'adventures', kind: 'adventure', schema: Adventure },
  { folder: 'notes', kind: 'note', schema: Note },
  { folder: 'npcs', kind: 'npc', schema: NPC },
  { folder: 'scenes', kind: 'scene', schema: Scene },
  { folder: 'counters', kind: 'counter', schema: CampaignCounter },
  { folder: 'timers', kind: 'timer', schema: CampaignTimer },
  { folder: 'pinnedRolls', kind: 'pinnedRoll', schema: PinnedRoll },
  { folder: 'sessions', kind: 'session', schema: Session },
];

/** Every file in a zip, by entry name, read into memory (campaigns are small; maps are a few MB). */
function readAllEntries(zipPath: string): Promise<Map<string, Buffer>> {
  return new Promise((done, fail) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return fail(err ?? new Error('could not open the file'));
      const out = new Map<string, Buffer>();
      zipfile.on('error', fail);
      zipfile.on('end', () => done(out));
      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) return zipfile.readEntry();
        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return fail(streamErr ?? new Error('bad entry'));
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('error', fail);
          stream.on('end', () => {
            out.set(posix.normalize(entry.fileName), Buffer.concat(chunks));
            zipfile.readEntry();
          });
        });
      });
      zipfile.readEntry();
    });
  });
}

export interface CampaignPackagerDeps {
  store: LibraryStore;
  campaigns: CampaignRepository;
  homebrew: HomebrewRepository;
  backups: BackupService | null;
  logger: Logger;
  appVersion: string;
  /** True when this Library's index holds the record (any enabled or disabled source). */
  hasRecord(ref: RecordRef): boolean;
}

/**
 * `.trifold-campaign` files (ADR 0015): one campaign, its media, the homebrew it uses and,
 * optionally, its console layout, in a zip with a `kind: "campaign"` manifest. Imported sources
 * are never included; the campaign keeps its references by key.
 */
export class CampaignPackager {
  constructor(private readonly deps: CampaignPackagerDeps) {}

  private async read(campaignId: string): Promise<{ slug: string; parts: CampaignParts }> {
    const slug = await this.deps.campaigns.slugFor(campaignId);
    return { slug, parts: await this.deps.campaigns.bundleOf(slug) };
  }

  async preview(campaignId: string, input: CampaignExportOptions): Promise<CampaignExportPreview> {
    const prepared = prepareExport(
      (await this.read(campaignId)).parts,
      CampaignExportOptions.parse(input),
    );
    return {
      pcs: prepared.pcs.length,
      homebrew: homebrewIdsIn(prepared).length,
      importedRecords: importedSourceRefs(prepared).length,
    };
  }

  /** Writes the export to `target` (atomically: a `.partial` renamed when complete). */
  async exportTo(campaignId: string, input: CampaignExportOptions, target: string): Promise<void> {
    const options = CampaignExportOptions.parse(input);
    const { slug, parts } = await this.read(campaignId);
    const prepared = prepareExport(parts, options);
    const zip = new yazl.ZipFile();
    const json = (path: string, value: unknown) =>
      zip.addBuffer(Buffer.from(JSON.stringify(value, null, 2)), path);

    json(`${ROOT}/campaign.json`, prepared.campaign);
    for (const { folder } of ENTITIES) {
      for (const item of prepared[folder]) json(`${ROOT}/${folder}/${item.id}.json`, item);
    }

    const skip = new Set(filesOnlyLeftOutPcsUse(parts, prepared));
    for (const media of [...MEDIA, CREATURES]) {
      for (const rel of await this.walk(`campaigns/${slug}/${media}`)) {
        const inCampaign = `${media}/${rel}`;
        if (skip.has(inCampaign)) continue;
        addFileLazily(
          zip,
          this.deps.store.resolvePath(`campaigns/${slug}/${inCampaign}`),
          `${ROOT}/${inCampaign}`,
        );
      }
    }

    let homebrew = 0;
    if (options.homebrew) {
      for (const id of homebrewIdsIn(prepared)) {
        const record = await this.deps.homebrew.get(id);
        if (!record) continue;
        json(`homebrew/${homebrewFile(id)}`, record);
        homebrew += 1;
      }
    }

    const layout = options.layout ? this.deps.store.getSettings().workspace.consoles[slug] : null;
    if (layout) json(LAYOUT, layout);

    const manifest: BackupManifest = {
      kind: 'campaign',
      appVersion: this.deps.appVersion,
      librarySchemaVersion: LIBRARY_SCHEMA_VERSION,
      campaignSchemaVersion: CAMPAIGN_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      counts: { campaigns: 1, homebrew, sources: 0 },
      campaign: {
        id: prepared.campaign.id,
        name: prepared.campaign.name,
        pcs: prepared.pcs.length,
        options,
      },
    };
    json(MANIFEST, manifest);
    zip.end();

    const partial = `${target}.partial`;
    await writeZipTo(zip, partial);
    await rename(partial, target);
    this.deps.logger.info(
      `campaign "${prepared.campaign.name}" exported to ${target} (${options.state}, party ${options.party ? 'on' : 'off'})`,
    );
  }

  /** Files under a Library-relative folder, relative to it with forward slashes. */
  private async walk(relative: string): Promise<string[]> {
    const out: string[] = [];
    const root = this.deps.store.resolvePath(relative);
    const visit = async (dir: string, prefix: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.endsWith('.tmp') || e.name.endsWith('.partial')) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) await visit(join(dir, e.name), rel);
        else if (e.isFile()) out.push(rel);
      }
    };
    await visit(root, '');
    return out;
  }

  /** Reads a file picked for import and says whether and how it can be imported. */
  async inspect(path: string): Promise<CampaignPackageInfo> {
    const info = await stat(path);
    const base = { path, name: basename(path), sizeBytes: info.size, existing: null };
    let summary: { names: string[]; manifest: unknown };
    try {
      summary = await readZipSummary(path);
    } catch (err) {
      return {
        ...base,
        manifest: null,
        problem: `Not a file Trifold can read (${errorMessage(err)})`,
      };
    }
    const manifest = parseManifest(summary.manifest);
    if (manifest?.kind === 'library') {
      return {
        ...base,
        manifest,
        problem: 'This is a Library backup; restore it from Settings › Backups',
      };
    }
    if (manifest?.kind !== 'campaign' || !summary.names.includes(`${ROOT}/campaign.json`)) {
      return { ...base, manifest, problem: 'Not a Trifold campaign export' };
    }
    if (
      manifest.librarySchemaVersion > LIBRARY_SCHEMA_VERSION ||
      manifest.campaignSchemaVersion > CAMPAIGN_SCHEMA_VERSION
    ) {
      return {
        ...base,
        manifest,
        problem: `Made by a newer Trifold${manifest.appVersion ? ` (${manifest.appVersion})` : ''}; update Trifold to import it`,
      };
    }
    const id = manifest.campaign?.id;
    const existing = id
      ? ((await this.deps.campaigns.list()).find((c) => c.id === id) ?? null)
      : null;
    return { ...base, manifest, existing, problem: null };
  }

  async importFrom(path: string, requested: CampaignPackageMode): Promise<CampaignPackageResult> {
    const checked = await this.inspect(path);
    if (checked.problem) throw new Error(checked.problem);
    const existing = checked.existing;
    if (existing && requested === 'new') {
      throw new Error(`${existing.name} is already in this Library: replace it or import a copy`);
    }
    const mode: CampaignPackageMode = !existing && requested === 'replace' ? 'new' : requested;
    const files = await readAllEntries(path);
    const { logger } = this.deps;

    const parse = <T>(name: string, schema: ZodType<T>, kind: FileKind): T | null => {
      try {
        return schema.parse(migrate(kind, JSON.parse(files.get(name)!.toString('utf8'))));
      } catch (err) {
        logger.warn(`campaign import: ${name} skipped: ${errorMessage(err)}`);
        return null;
      }
    };
    const campaign = parse(`${ROOT}/campaign.json`, Campaign, 'campaign');
    if (!campaign) throw new Error('The campaign file in this export could not be read');
    const group = <T>(folder: EntityFolder, schema: ZodType<T>, kind: FileKind): T[] =>
      [...files.keys()]
        .filter((n) => n.startsWith(`${ROOT}/${folder}/`) && n.endsWith('.json'))
        .map((n) => parse(n, schema, kind))
        .filter((x): x is T => x !== null);
    let parts: CampaignParts = {
      campaign,
      pcs: group('pcs', PCCard, 'pc'),
      encounters: group('encounters', Encounter, 'encounter'),
      adventures: group('adventures', Adventure, 'adventure'),
      notes: group('notes', Note, 'note'),
      npcs: group('npcs', NPC, 'npc'),
      scenes: group('scenes', Scene, 'scene'),
      // Exports from before counters (ADR 0019) have no counters folder.
      counters: group('counters', CampaignCounter, 'counter'),
      timers: group('timers', CampaignTimer, 'timer'),
      pinnedRolls: group('pinnedRolls', PinnedRoll, 'pinnedRoll'),
      // Exports from before the session log (ADR 0040) have no sessions folder.
      sessions: group('sessions', Session, 'session'),
    };

    // The campaign's creatures (ADR 0035): a copy gives them new ids, swapped wherever the
    // campaign names them, as withNewIds does for everything else.
    const oldSource = campaignSourceId(parts.campaign.slug);
    let creatures: CompendiumRecord[] = [];
    for (const name of files.keys()) {
      if (!name.startsWith(`${ROOT}/${CREATURES}/`) || !name.endsWith('.json')) continue;
      const record = parse(name, CompendiumRecord, 'record');
      if (record && RECORD_ID.test(record.id)) creatures.push(record);
    }
    if (mode === 'copy' && creatures.length) {
      const renamed = new Map(creatures.map((r) => [r.id, `creature:${r.kind}:${ulid()}`]));
      parts = swapStrings(parts, renamed);
      creatures = creatures.map((r) => ({ ...r, id: renamed.get(r.id)! }));
    }

    let safety: string | null = null;
    let slug: string;
    if (mode === 'replace' && existing) {
      safety = (await this.deps.backups?.create('preRestore'))?.name ?? null;
      slug = existing.slug;
      await rm(this.deps.store.resolvePath(`campaigns/${slug}`), { recursive: true, force: true });
    } else {
      if (mode === 'copy') {
        parts = withNewIds(parts, ulid);
        parts = {
          ...parts,
          campaign: { ...parts.campaign, name: `${parts.campaign.name} (copy)` },
        };
      }
      slug = await this.deps.campaigns.freeSlug(parts.campaign.name);
    }
    parts = { ...parts, campaign: { ...parts.campaign, slug } };
    // References to the creatures follow the campaign to its folder's source id.
    const newSource = campaignSourceId(slug);
    if (newSource !== oldSource) parts = swapStrings(parts, new Map([[oldSource, newSource]]));

    const { store } = this.deps;
    const dir = `campaigns/${slug}`;
    for (const sub of CAMPAIGN_LAYOUT) {
      await mkdir(store.resolvePath(`${dir}/${sub}`), { recursive: true });
    }
    await store.writeJson(`${dir}/campaign.json`, parts.campaign);
    for (const { folder } of ENTITIES) {
      for (const item of parts[folder])
        await store.writeJson(`${dir}/${folder}/${item.id}.json`, item);
    }
    for (const [name, data] of files) {
      const media = MEDIA.find((m) => name.startsWith(`${ROOT}/${m}/`));
      if (!media || name.split('/').includes('..')) continue;
      // resolvePath refuses anything that would leave the Library.
      await writeFileAtomic(store.resolvePath(`${dir}/${name.slice(ROOT.length + 1)}`), data);
    }
    for (const record of creatures) {
      await store.writeJson(`${dir}/${CREATURES}/${homebrewFile(record.id)}`, {
        ...record,
        sourceId: newSource,
      });
    }

    let homebrewAdded = 0;
    let homebrewKept = 0;
    for (const name of files.keys()) {
      if (!name.startsWith('homebrew/') || !name.endsWith('.json')) continue;
      const record = parse(name, CompendiumRecord, 'record');
      if (!record || record.sourceId !== HOMEBREW_SOURCE || !RECORD_ID.test(record.id)) continue;
      const mine = await this.deps.homebrew.get(record.id);
      if (mine) {
        if (JSON.stringify(mine) !== JSON.stringify(record)) homebrewKept += 1;
        continue;
      }
      await store.writeJson(`homebrew/${homebrewFile(record.id)}`, record);
      homebrewAdded += 1;
    }

    if (files.has(LAYOUT)) {
      // A layout is not a versioned file of its own: it is validated as part of library.json.
      let layout: ShellLayout | null = null;
      try {
        layout = ShellLayout.parse(JSON.parse(files.get(LAYOUT)!.toString('utf8')));
      } catch (err) {
        logger.warn(`campaign import: layout skipped: ${errorMessage(err)}`);
      }
      if (layout) {
        const workspace = store.getSettings().workspace;
        await store.updateSettings({
          workspace: { ...workspace, consoles: { ...workspace.consoles, [slug]: layout } },
        });
      }
    }

    let unresolved = 0;
    for (const ref of recordRefsIn(parts)) {
      // Bundled records are always there; the campaign's own creatures came in with it.
      if (isBundledSource(ref.sourceId) || ref.sourceId.startsWith('campaign:')) continue;
      const found =
        ref.sourceId === HOMEBREW_SOURCE
          ? (await this.deps.homebrew.get(ref.recordId)) !== null
          : this.deps.hasRecord(ref);
      if (!found) unresolved += 1;
    }

    const summary = (await this.deps.campaigns.list()).find((c) => c.id === parts.campaign.id);
    if (!summary) throw new Error('The imported campaign could not be read back');
    logger.info(
      `campaign "${summary.name}" imported (${mode}) into ${dir}: ${homebrewAdded} homebrew added, ${homebrewKept} kept, ${unresolved} unresolved`,
    );
    return { campaign: summary, mode, homebrewAdded, homebrewKept, unresolved, safety };
  }
}

/** Every string in `value` that is a key of `map` replaced by its value, at any depth. */
function swapStrings<T>(value: T, map: ReadonlyMap<string, string>): T {
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') return map.get(v) ?? v;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, child]) => [k, swap(child)]));
    }
    return v;
  };
  return swap(value) as T;
}

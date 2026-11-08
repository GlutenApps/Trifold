import { createHash } from 'node:crypto';
import { z } from 'zod';
import { glyphForCreature, maskedNameFor, numberedNames, type IconTableSet } from '@trifold/rules';
import {
  Adventure,
  CAMPAIGN_SCHEMA_VERSION,
  Campaign,
  CampaignSettings,
  Encounter,
  GridSpec,
  Note,
  NPC,
  PCCard,
  Scene,
  type CombatantTemplate,
  type CompendiumRecord,
  type EntityRef,
  type RecordRef,
  type SceneBackground,
  type SceneImage,
  type Token,
} from '@trifold/schema';
import type { CampaignParts } from '../campaign/exportPackage';

/**
 * The bundled sample campaign (ADR 0016), built from `samples/<name>/` at build time: a
 * hand-written `campaign.json` with readable slugs, one Markdown file per note, and the images.
 * `buildSampleCampaign` turns that source into the campaign files a `.trifold-campaign` carries,
 * with ULIDs derived from the slugs so every build gives the same ids (the app recognises the
 * sample by its campaign id). Reading files and zipping are the build script's job.
 */

/** Every sample object carries this time, so builds are byte-for-byte repeatable. */
export const SAMPLE_TIME = '2026-11-07T00:00:00.000Z';

const Cell = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
const SourceCombatant = z
  .object({
    npc: z.string().optional(),
    record: z.string().optional(),
    label: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    role: z.enum(['ally', 'enemy', 'neutral']).default('enemy'),
    hidden: z.boolean().default(false),
    /** Map cells (top-left, grid units) for this combatant's tokens on the encounter's scene. */
    cells: z.array(Cell).optional(),
  })
  .refine((c) => Boolean(c.npc) !== Boolean(c.record), 'a combatant names an npc or a record');

export const SampleSource = z.object({
  campaign: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    preferredEdition: z.enum(['2014', '2024']).default('2024'),
    settings: CampaignSettings.partial().default({}),
  }),
  adventure: z.object({ id: z.string(), name: z.string(), summary: z.string().default('') }),
  pcs: z.array(
    PCCard.omit({ schemaVersion: true, createdAt: true, updatedAt: true }).extend({
      id: z.string(),
    }),
  ),
  npcs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      record: z.string().optional(),
      role: z.string().default(''),
      location: z.string().default(''),
      notes: z.string().default(''),
    }),
  ),
  encounters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      scene: z.string().nullable().default(null),
      notes: z.string().default(''),
      combatants: z.array(SourceCombatant),
    }),
  ),
  scenes: z.array(
    z.object({
      id: z.string(),
      parent: z.string().optional(),
      kind: z.enum(['folder', 'title', 'image', 'map', 'blankGrid']),
      title: z.string(),
      subtitle: z.string().default(''),
      showTitleOverride: z.boolean().nullable().default(null),
      backdrop: z.enum(['parchment', 'stone', 'dark']).optional(),
      /** Source-relative image path (`images/inn.jpg`); JPEG only, the long edge ≤ 4096 px. */
      image: z.string().optional(),
      /** Map variants (night, flood) instead of `image`; the first is shown. Same size each. */
      backgrounds: z.array(z.object({ name: z.string().min(1), image: z.string() })).optional(),
      grid: GridSpec.partial().optional(),
      blank: z.object({ cols: z.number().int(), rows: z.number().int() }).optional(),
      encounter: z.string().optional(),
      notes: z.string().default(''),
    }),
  ),
});
export type SampleSource = z.infer<typeof SampleSource>;

export interface SampleNoteFile {
  /** File name, used for errors and as a tie-break. */
  name: string;
  text: string;
}

export interface SampleInput {
  source: unknown;
  notes: SampleNoteFile[];
  /** Pixel size of each image the scenes name, by source-relative path. */
  imageSizes: ReadonlyMap<string, { width: number; height: number }>;
  /** The bundled records the sample refers to, by id. */
  records: ReadonlyMap<string, CompendiumRecord>;
  icons: IconTableSet;
  /** Glyph names the build ships; a glyph outside this set is left off (tokens show initials). */
  availableIcons: ReadonlySet<string>;
}

export interface SampleMedia {
  /** Source-relative path. */
  from: string;
  /** Path inside the campaign folder. */
  to: string;
}

export interface SampleBuild {
  parts: CampaignParts;
  media: SampleMedia[];
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A valid ULID for `key`: the sample time, then 80 bits of its SHA-256. */
export function sampleId(key: string): string {
  let time = Date.parse(SAMPLE_TIME);
  let head = '';
  for (let i = 0; i < 10; i += 1) {
    head = CROCKFORD[time % 32]! + head;
    time = Math.floor(time / 32);
  }
  const hash = createHash('sha256').update(`trifold-sample:${key}`).digest();
  let tail = '';
  for (let i = 0; i < 16; i += 1) tail += CROCKFORD[hash[i]! % 32];
  return head + tail;
}

/** `---` front matter (title, folder, order, tags) and the Markdown body after it. */
export function parseNoteFile(file: SampleNoteFile): {
  title: string;
  folder: string;
  order: number;
  tags: string[];
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(file.text);
  if (!match) throw new Error(`${file.name}: no front matter`);
  const fields = new Map<string, string>();
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fields.set(kv[1]!, kv[2]!.trim());
  }
  const unquote = (s: string) => s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  const title = unquote(fields.get('title') ?? '');
  if (!title) throw new Error(`${file.name}: no title`);
  const tagText = (fields.get('tags') ?? '').replace(/^\[|\]$/g, '');
  return {
    title,
    folder: unquote(fields.get('folder') ?? ''),
    order: Number(fields.get('order') ?? 0) || 0,
    tags: tagText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    body: match[2]!.trim() + '\n',
  };
}

/** Width and height from a JPEG's first start-of-frame marker; null when it is not a JPEG. */
export function jpegSize(data: Uint8Array): { width: number; height: number } | null {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < data.length) {
    if (data[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = data[i + 1]!;
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (data[i + 5]! << 8) | data[i + 6]!,
        width: (data[i + 7]! << 8) | data[i + 8]!,
      };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + ((data[i + 2]! << 8) | data[i + 3]!);
  }
  return null;
}

function footprintFor(size: string | null | undefined): Token['footprint'] {
  switch ((size ?? '').trim().toUpperCase()) {
    case 'L':
      return 2;
    case 'H':
      return 3;
    case 'G':
      return 4;
    default:
      return 1;
  }
}

const stamp = {
  schemaVersion: CAMPAIGN_SCHEMA_VERSION,
  createdAt: SAMPLE_TIME,
  updatedAt: SAMPLE_TIME,
};

/** Builds the campaign files. Throws on anything inconsistent: this runs at build time. */
export function buildSampleCampaign(input: SampleInput): SampleBuild {
  const src = SampleSource.parse(input.source);
  const id = (key: string) => sampleId(`${src.campaign.slug}:${key}`);

  const recordRef = (recordId: string): { ref: RecordRef; record: CompendiumRecord } => {
    const record = input.records.get(recordId);
    if (!record) throw new Error(`unknown record ${recordId}`);
    return {
      ref: { recordId, sourceId: record.sourceId, key: record.key, edition: record.edition },
      record,
    };
  };
  const monster = (record: CompendiumRecord) => (record.kind === 'monster' ? record.data : null);

  const npcs = src.npcs.map((n) =>
    NPC.parse({
      ...stamp,
      id: id(n.id),
      name: n.name,
      ...(n.record ? { recordRef: recordRef(n.record).ref } : {}),
      role: n.role,
      location: n.location,
      notes: n.notes,
      isAlive: true,
    }),
  );
  const npcBySlug = new Map(src.npcs.map((n, i) => [n.id, { source: n, npc: npcs[i]! }]));

  const pcs = src.pcs.map((p) => PCCard.parse({ ...p, ...stamp, id: id(p.id) }));

  // Encounters, and the tokens their placed combatants put on the scene they name.
  const sceneSlugs = new Set(src.scenes.map((s) => s.id));
  const tokensByScene = new Map<string, Token[]>();
  const encounters = src.encounters.map((e) => {
    if (e.scene && !sceneSlugs.has(e.scene)) throw new Error(`${e.id}: unknown scene ${e.scene}`);
    const combatants: CombatantTemplate[] = e.combatants.map((c, i) => {
      let ref: EntityRef;
      let data: ReturnType<typeof monster> = null;
      if (c.npc) {
        const found = npcBySlug.get(c.npc);
        if (!found) throw new Error(`${e.id}: unknown npc ${c.npc}`);
        ref = { kind: 'npc', npcId: found.npc.id, name: found.npc.name };
        if (found.source.record) data = monster(recordRef(found.source.record).record);
      } else {
        const { ref: rr, record } = recordRef(c.record!);
        ref = { kind: 'record', ref: rr, name: record.displayName || record.name };
        data = monster(record);
      }
      const template: CombatantTemplate = {
        id: id(`${e.id}:${i}`),
        ref,
        ...(c.label ? { label: c.label } : {}),
        quantity: c.quantity,
        role: c.role,
        hidden: c.hidden,
        cache: data
          ? {
              xp: data.xp,
              cr: data.cr,
              type: data.type,
              hp: data.hp?.average ?? 0,
              ac: data.ac?.value ?? 10,
            }
          : { xp: 0, cr: '', type: '', hp: 0, ac: 10 },
      };
      if (!c.cells) return template;
      if (!e.scene) throw new Error(`${e.id}: tokens placed but no scene`);
      if (c.cells.length !== c.quantity) {
        throw new Error(`${e.id}: combatant ${i} has ${c.cells.length} cells for ${c.quantity}`);
      }
      const type = data?.type ?? '';
      const match = glyphForCreature({ name: ref.name, type }, input.icons);
      const glyph = match && input.availableIcons.has(match.icon) ? match.icon : null;
      const names = numberedNames(c.label || ref.name, c.quantity);
      const tokens: Token[] = c.cells.map(([x, y], n) => ({
        id: id(`${e.id}:${i}:token:${n}`),
        kind: 'creature',
        ref,
        label: names[n]!,
        maskedLabel: maskedNameFor(type),
        x,
        y,
        footprint: footprintFor(data?.size),
        role: c.role,
        hidden: c.hidden,
        nameMasked: true,
        dead: false,
        ...(glyph ? { glyph } : {}),
      }));
      const list = tokensByScene.get(e.scene) ?? [];
      list.push(...tokens);
      tokensByScene.set(e.scene, list);
      return { ...template, tokenIds: tokens.map((t) => t.id) };
    });
    return Encounter.parse({
      ...stamp,
      id: id(e.id),
      name: e.name,
      ...(e.scene ? { sceneId: id(e.scene) } : {}),
      combatants,
      notes: e.notes,
      state: null,
      results: [],
    });
  });

  // Scenes: a tree in source order. Each image becomes `images/<id>.jpg`; the sample images are
  // already display-sized JPEGs (≤ 4096 px), so the display path names the same file. A map with
  // backgrounds shows the first one, and `image` is a copy of it, as the app keeps it.
  const media: SampleMedia[] = [];
  const order = new Map<string, number>();
  const sceneImage = (sceneSlug: string, from: string, fileId: string): SceneImage => {
    if (!/\.jpe?g$/i.test(from)) throw new Error(`${sceneSlug}: images must be JPEG`);
    const size = input.imageSizes.get(from);
    if (!size) throw new Error(`${sceneSlug}: no size for ${from}`);
    if (Math.max(size.width, size.height) > 4096) throw new Error(`${from} is over 4096 px`);
    const path = `images/${fileId}.jpg`;
    media.push({ from, to: path });
    return { path, displayPath: path, width: size.width, height: size.height };
  };
  const scenes = src.scenes.map((s) => {
    if (s.parent && !sceneSlugs.has(s.parent)) throw new Error(`${s.id}: unknown parent`);
    if (s.image && s.backgrounds)
      throw new Error(`${s.id}: give an image or backgrounds, not both`);
    const siblings = order.get(s.parent ?? '') ?? 0;
    order.set(s.parent ?? '', siblings + 1);
    const sceneId = id(s.id);
    const backgrounds: SceneBackground[] | undefined = s.backgrounds?.map((b, i) => {
      const bgId = id(`${s.id}:background:${i}`);
      return { id: bgId, name: b.name, image: sceneImage(s.id, b.image, bgId) };
    });
    if (backgrounds?.length === 0) throw new Error(`${s.id}: empty backgrounds`);
    if (
      backgrounds?.some(
        (b) =>
          b.image.width !== backgrounds[0]!.image.width ||
          b.image.height !== backgrounds[0]!.image.height,
      )
    ) {
      throw new Error(`${s.id}: backgrounds must all be the same size (they share one grid)`);
    }
    const image: SceneImage | undefined = backgrounds
      ? backgrounds[0]!.image
      : s.image
        ? sceneImage(s.id, s.image, sceneId)
        : undefined;
    const grid = s.grid ? GridSpec.parse(s.grid) : undefined;
    const tokens = tokensByScene.get(s.id) ?? [];
    if (tokens.length && (!grid || !image))
      throw new Error(`${s.id}: tokens need a grid and an image`);
    for (const t of tokens) {
      const right = grid!.offsetX + (t.x + t.footprint) * grid!.cellPx;
      const bottom = grid!.offsetY + (t.y + t.footprint) * grid!.cellPx;
      if (right > image!.width || bottom > image!.height) {
        throw new Error(`${s.id}: token ${t.label} at ${t.x},${t.y} is off the map`);
      }
    }
    if (s.encounter && !src.encounters.some((e) => e.id === s.encounter)) {
      throw new Error(`${s.id}: unknown encounter ${s.encounter}`);
    }
    return Scene.parse({
      ...stamp,
      id: sceneId,
      kind: s.kind,
      title: s.title,
      subtitle: s.subtitle,
      showTitleOverride: s.showTitleOverride,
      parentId: s.parent ? id(s.parent) : null,
      order: siblings,
      notes: s.notes,
      ...(image ? { image } : {}),
      ...(backgrounds ? { backgrounds, activeBackgroundId: backgrounds[0]!.id } : {}),
      ...(s.backdrop ? { backdrop: s.backdrop } : {}),
      ...(grid ? { grid } : {}),
      ...(s.blank ? { blank: s.blank } : {}),
      tokens,
      ...(s.encounter ? { encounterId: id(s.encounter) } : {}),
    });
  });

  // Notes: root notes first by their order, then one folder per distinct folder name, in the
  // order the folders' first notes appear (file names sort the source).
  const parsed = [...input.notes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ file: f.name, ...parseNoteFile(f) }));
  const folderNames = [...new Set(parsed.map((n) => n.folder).filter(Boolean))];
  const rootCount = parsed.filter((n) => !n.folder).length;
  const folders = folderNames.map((name, i) =>
    Note.parse({
      ...stamp,
      id: id(`folder:${name}`),
      kind: 'folder',
      title: name,
      parentId: null,
      order: rootCount + i,
    }),
  );
  const folderId = new Map(folderNames.map((name, i) => [name, folders[i]!.id]));
  const notes = parsed.map((n) =>
    Note.parse({
      ...stamp,
      id: id(`note:${n.file}`),
      kind: 'note',
      title: n.title,
      body: n.body,
      tags: n.tags,
      parentId: n.folder ? folderId.get(n.folder)! : null,
      order: n.order,
    }),
  );

  const adventure = Adventure.parse({
    ...stamp,
    id: id(src.adventure.id),
    name: src.adventure.name,
    summary: src.adventure.summary,
    sceneIds: scenes.map((s) => s.id),
    encounterIds: encounters.map((e) => e.id),
    noteIds: notes.map((n) => n.id),
    order: 0,
  });

  const campaign = Campaign.parse({
    ...stamp,
    id: id('campaign'),
    name: src.campaign.name,
    slug: src.campaign.slug,
    preferredEdition: src.campaign.preferredEdition,
    settings: src.campaign.settings,
    activeAdventureId: adventure.id,
  });

  return {
    parts: {
      campaign,
      pcs,
      encounters,
      adventures: [adventure],
      notes: [...folders, ...notes],
      npcs,
      scenes,
    },
    media,
  };
}

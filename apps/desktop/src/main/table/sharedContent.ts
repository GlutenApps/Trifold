import { createHash } from 'node:crypto';
import type {
  Campaign,
  CompendiumRecord,
  NPC,
  RecordKind,
  Source,
  SourceLicense,
} from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';
import { sharedSourceId } from '../joined/store';
import { booksInCollections, type BookCollection } from '@trifold/rules';
import { sourceShowsIn, type CampaignView } from '../sources/campaignScope';
import type { SourceCatalog } from '../sources/catalog';
import type { HomebrewRepository } from '../sources/homebrew';

/**
 * Shared content (docs/PLAYER-MODE.md, "Shared content"; ADR 0060): what a campaign's players
 * are given to build and play characters, and nothing that would spoil the game. The GM chooses
 * it in the campaign; this module turns the choice into the records a player's Trifold keeps as
 * one read-only source bound to the joined campaign.
 *
 * - Imported sources the GM ticked, player-facing kinds only: creatures never pass by source.
 * - Homebrew the GM ticked, record by record, creatures excepted.
 * - Creatures, only the stat blocks of the campaign's companion list, of NPC companions, and of
 *   NPCs a player holds. Nothing comes from encounters.
 * - Bundled SRD content is never sent: every Trifold has it.
 */

/** The record kinds a ticked source shares. `monster` is not one of them. */
export const PLAYER_FACING_KINDS: readonly RecordKind[] = [
  'spell',
  'item',
  'feat',
  'species',
  'background',
  'class',
  'condition',
  'rule',
];

// The id of the source a joined campaign's shared content lives in, on the player's side.
export { sharedSourceId };

/** Bundled sources ship with every Trifold. */
const isBundled = (sourceId: string): boolean => sourceId.startsWith('srd-');

export interface SharedContent {
  /** Changes whenever what is shared changes; a player's Trifold syncs when it differs. */
  hash: string;
  records: CompendiumRecord[];
}

export const NOTHING_SHARED: SharedContent = { hash: '', records: [] };

export interface SharedSelection {
  campaignId: string;
  /** Ticked imported sources, with their records. */
  sources: ReadonlyArray<{
    source: Pick<Source, 'id' | 'name'> & { license: Pick<SourceLicense, 'nonSrd'> };
    records: readonly CompendiumRecord[];
  }>;
  /** Ticked homebrew records. */
  homebrew: readonly CompendiumRecord[];
  /** The stat blocks players may see, each with the name of the source it came from. */
  creatures: ReadonlyArray<{ record: CompendiumRecord; sourceName: string; nonSrd: boolean }>;
}

/**
 * The records to share, as the player's Trifold stores them: each under the joined campaign's
 * shared source, with an id of its own there (a GM's homebrew id could match the player's), and
 * with the name of the source it came from and its non-SRD flag.
 */
export function selectShared(input: SharedSelection): SharedContent {
  const sourceId = sharedSourceId(input.campaignId);
  const out = new Map<string, CompendiumRecord>();
  const add = (record: CompendiumRecord, sourceName: string, nonSrd: boolean) => {
    if (isBundled(record.sourceId)) return;
    const id = `${sourceId}:${record.id}`;
    if (out.has(id)) return;
    // The same record, moved: a copy with its own id and source, and no link back to the
    // record it was made from, which the player's Library does not have.
    const copy: CompendiumRecord = { ...record, id, sourceId, sharedFrom: { sourceName, nonSrd } };
    delete copy.basedOn;
    out.set(id, copy);
  };
  for (const { source, records } of input.sources) {
    for (const record of records) {
      if (PLAYER_FACING_KINDS.includes(record.kind))
        add(record, source.name, source.license.nonSrd);
    }
  }
  for (const record of input.homebrew) {
    // A homebrew creature is as much a spoiler as any other: it crosses only as a companion.
    if (record.kind === 'monster') continue;
    // Homebrew made from an imported record carries that record's text.
    const from = record.basedOn?.sourceId;
    add(record, 'Homebrew', !!from && !isBundled(from) && from !== record.sourceId);
  }
  for (const { record, sourceName, nonSrd } of input.creatures) {
    if (record.kind === 'monster') add(record, sourceName, nonSrd);
  }
  // Plain code-point order: the hash must not depend on this computer's language.
  const records = [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (records.length === 0) return NOTHING_SHARED;
  const hash = createHash('sha256');
  for (const record of records) hash.update(JSON.stringify(record)).update('\n');
  return { hash: hash.digest('hex').slice(0, 32), records };
}

/** What the loader reads from: the open Library's sources, homebrew and index. */
export interface SharedSources {
  catalog: SourceCatalog;
  index: Pick<IndexDb, 'get' | 'recordsOfBooks'>;
  homebrew: Pick<HomebrewRepository, 'list'>;
}

/**
 * Reads what the open campaign shares. `heldNpcIds` are the NPCs some player holds at the table
 * now; their stat blocks go with them, as a companion's does.
 */
export async function loadShared(
  from: SharedSources,
  campaign: Pick<Campaign, 'id' | 'settings'>,
  view: CampaignView,
  npcs: ReadonlyArray<Pick<NPC, 'id' | 'companionOf' | 'recordRef'>>,
  heldNpcIds: ReadonlySet<string>,
  collections: readonly BookCollection[] = [],
): Promise<SharedContent> {
  const shared = campaign.settings.shared;
  const all = await from.catalog.list();
  const byId = new Map(all.map((s) => [s.id, s]));

  const sources: Array<SharedSelection['sources'][number]> = [];
  for (const id of shared.sourceIds) {
    const source = byId.get(id);
    // Only an imported source the campaign itself sees; a source since removed shares nothing.
    if (!source || !source.enabled || isBundled(source.id)) continue;
    if (source.kind !== 'xml' && source.kind !== 'open5e') continue;
    if (!sourceShowsIn(source, view)) continue;
    sources.push({ source, records: await from.catalog.readAllRecords(id) });
  }

  // A shared collection (ADR 0062) or book (ADR 0067) shares its books' records, grouped by the
  // file they are in.
  const bookKeys = [
    ...new Set([
      ...booksInCollections(collections, shared.collectionIds ?? []),
      ...(shared.bookKeys ?? []),
    ]),
  ];
  const byFile = new Map<string, CompendiumRecord[]>();
  for (const record of bookKeys.length ? from.index.recordsOfBooks(bookKeys) : []) {
    const list = byFile.get(record.sourceId) ?? [];
    list.push(record);
    byFile.set(record.sourceId, list);
  }
  for (const [id, records] of byFile) {
    const source = byId.get(id);
    if (!source || !source.enabled || !sourceShowsIn(source, view)) continue;
    sources.push({ source, records });
  }

  const ticked = new Set(shared.homebrewIds);
  const homebrew = ticked.size ? (await from.homebrew.list()).filter((r) => ticked.has(r.id)) : [];

  const creatureIds = new Set<string>(campaign.settings.summonable.map((e) => e.ref.recordId));
  for (const npc of npcs) {
    if ((npc.companionOf || heldNpcIds.has(npc.id)) && npc.recordRef) {
      creatureIds.add(npc.recordRef.recordId);
    }
  }
  const creatures: Array<SharedSelection['creatures'][number]> = [];
  for (const recordId of creatureIds) {
    const record = from.index.get(recordId);
    if (!record) continue;
    const source = byId.get(record.sourceId);
    creatures.push({
      record,
      sourceName: source?.kind === 'campaign' ? 'This campaign' : (source?.name ?? 'Homebrew'),
      nonSrd: source?.license.nonSrd ?? false,
    });
  }
  return selectShared({ campaignId: campaign.id, sources, homebrew, creatures });
}

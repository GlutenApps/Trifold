import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CampaignSummary } from '@trifold/api';
import { CompendiumRecord, type RecordRef, type Source } from '@trifold/schema';
import type { IndexDb } from '../index/IndexDb';
import type { LibraryStore } from '../library/LibraryStore';
import type { Logger } from '../log';
import { withParsedFeatures, type HomebrewRepository } from './homebrew';
import type { SourceRepository } from './repository';

/**
 * Per-campaign sources (ADR 0036): an imported source can show in every campaign or only in the
 * campaigns it names (`Source.campaignIds`). A campaign file's stat blocks start as that campaign
 * only. This module answers which sources a campaign sees, finds which campaigns use a source,
 * and links campaign-file sources imported before ADR 0036 to the campaigns that use them.
 */

/** The open campaign as visibility needs it. */
export interface CampaignView {
  id: string;
  /** Its creature source (ADR 0035), `campaign:<slug>`. */
  sourceId: string;
}

/** Whether a source's records show while `campaign` is open. */
export function sourceShowsIn(
  source: Pick<Source, 'id' | 'kind' | 'campaignIds'>,
  campaign: CampaignView,
): boolean {
  if (source.kind === 'campaign') return source.id === campaign.sourceId;
  return !source.campaignIds || source.campaignIds.includes(campaign.id);
}

/** The name the campaign importer gives a campaign file's stat blocks. */
const CAMPAIGN_FILE_SUFFIX = ' (campaign file)';

/** A campaign file's own stat blocks (written by `importCampaignXml`). */
export function isCampaignFileSource(source: Pick<Source, 'kind' | 'name'>): boolean {
  return source.kind === 'xml' && source.name.endsWith(CAMPAIGN_FILE_SUFFIX);
}

/** Only imported files can be limited; the SRD, homebrew and campaign creatures cannot. */
export function canLimitToCampaigns(source: Pick<Source, 'kind'>, bundled: boolean): boolean {
  return !bundled && (source.kind === 'xml' || source.kind === 'open5e');
}

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir, { recursive: true });
    return names.filter((n) => n.endsWith('.json')).map((n) => join(dir, n));
  } catch {
    return [];
  }
}

/**
 * For each source id, the campaigns whose files name it (an NPC's stat block, an encounter row,
 * a fight, a map token): a plain text scan of every JSON file in each campaign folder, since a
 * source id is a ULID that appears nowhere else.
 */
export async function campaignsUsing(
  store: LibraryStore,
  campaigns: readonly CampaignSummary[],
  sourceIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>(sourceIds.map((id) => [id, []]));
  if (sourceIds.length === 0) return out;
  for (const campaign of campaigns) {
    const found = new Set<string>();
    for (const file of await jsonFiles(store.resolvePath(`campaigns/${campaign.slug}`))) {
      let text: string;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        continue;
      }
      for (const id of sourceIds) if (!found.has(id) && text.includes(`"${id}"`)) found.add(id);
      if (found.size === sourceIds.length) break;
    }
    for (const id of found) out.get(id)!.push(campaign.id);
  }
  return out;
}

interface ScopeContext {
  store: LibraryStore;
  sources: SourceRepository;
  index: IndexDb;
  logger: Logger;
}

/**
 * Campaign-file sources imported before ADR 0036 carry no `campaignIds`: each is limited to the
 * campaigns that use it, or set to every campaign when none does. Runs once per source, since
 * the answer is written to its `source.json`.
 */
export async function linkCampaignFileSources(
  ctx: ScopeContext,
  campaigns: readonly CampaignSummary[],
): Promise<number> {
  const pending = (await ctx.sources.list()).filter(
    (s) => s.campaignIds === undefined && isCampaignFileSource(s),
  );
  if (pending.length === 0) return 0;
  const used = await campaignsUsing(
    ctx.store,
    campaigns,
    pending.map((s) => s.id),
  );
  for (const source of pending) {
    const ids = used.get(source.id) ?? [];
    const campaignIds = ids.length > 0 ? ids : null;
    await ctx.sources.write({ ...source, campaignIds });
    ctx.index.setSourceCampaigns(source.id, campaignIds);
    ctx.logger.info(
      `source ${source.name}: ${campaignIds ? `limited to ${campaignIds.length} campaign(s)` : 'used by no campaign, shown in every campaign'}`,
    );
  }
  return pending.length;
}

/**
 * After a campaign comes in from a package (ADR 0015), every limited source it uses also shows
 * in it, so its NPCs and encounters never point at a stat block it cannot see.
 */
export async function shareUsedSources(
  ctx: ScopeContext,
  campaign: CampaignSummary,
): Promise<void> {
  const limited = (await ctx.sources.list()).filter(
    (s) => s.campaignIds && !s.campaignIds.includes(campaign.id),
  );
  if (limited.length === 0) return;
  const used = await campaignsUsing(
    ctx.store,
    [campaign],
    limited.map((s) => s.id),
  );
  for (const source of limited) {
    if ((used.get(source.id) ?? []).length === 0) continue;
    const campaignIds = [...(source.campaignIds ?? []), campaign.id];
    await ctx.sources.write({ ...source, campaignIds });
    ctx.index.setSourceCampaigns(source.id, campaignIds);
    ctx.logger.info(`source ${source.name}: now also shown in ${campaign.name}`);
  }
}

/** What `bringStatBlock` needs: the index, the sources and the open campaign's creatures. */
export interface StatBlockContext {
  index: Pick<IndexDb, 'get'>;
  sourceOf(sourceId: string): Promise<Pick<Source, 'id' | 'kind' | 'campaignIds'> | null>;
  creatures: Pick<HomebrewRepository, 'list' | 'adopt'>;
  view: CampaignView;
}

/**
 * An NPC copied from another campaign (ADR 0036) whose stat block this campaign cannot see (an
 * adventure's own stat blocks, or the other campaign's creatures) brings that one stat block
 * along as one of this campaign's creatures, reusing an identical one already there. Anything
 * else, or a stat block that is not in the index, leaves the reference as it was.
 */
export async function bringStatBlock<T extends { recordRef?: RecordRef }>(
  holder: T,
  ctx: StatBlockContext,
): Promise<{ value: T; copied: boolean }> {
  const ref = holder.recordRef;
  if (!ref) return { value: holder, copied: false };
  const record = ctx.index.get(ref.recordId);
  if (!record) return { value: holder, copied: false };
  const source = await ctx.sourceOf(record.sourceId);
  if (!source || sourceShowsIn(source, ctx.view)) return { value: holder, copied: false };
  // Compared as a save would write it: saving re-derives a monster's features.
  const same = JSON.stringify(CompendiumRecord.parse(withParsedFeatures(record)).data);
  const existing = (await ctx.creatures.list()).find(
    (r) => r.kind === record.kind && r.key === record.key && JSON.stringify(r.data) === same,
  );
  const target = existing ?? (await ctx.creatures.adopt(record));
  return {
    value: {
      ...holder,
      recordRef: {
        recordId: target.id,
        sourceId: target.sourceId,
        key: target.key,
        edition: target.edition,
      },
    },
    copied: !existing,
  };
}

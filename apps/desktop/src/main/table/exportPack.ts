import type { PlayerPackOptions } from '@trifold/api';
import { nowIso } from '@trifold/schema';
import type { LibrarySession } from '../library/session';
import { campaignsUsing, sourceShowsIn } from '../sources/campaignScope';
import { writePlayerPack } from './playerPack';
import { loadShared } from './sharedContent';

/**
 * Export for players (ADR 0064): the open campaign's shared content as a `.trifold-players`
 * pack, for before the first session. Homebrew and creatures the campaign shares always go in;
 * a shared imported source or collection only when the GM ticks it here, since a pack is a file
 * that can be forwarded and never expires. The imported sources left out are named, so a
 * player who owns one knows to import it.
 */
export async function exportPlayerPack(
  session: LibrarySession,
  options: PlayerPackOptions,
  target: string,
  appVersion: string,
): Promise<{ records: number }> {
  const view = session.openCampaignView();
  const { campaigns, homebrew } = session;
  if (!view || !campaigns || !homebrew) throw new Error('Open the campaign first.');
  const { catalog, index, store } = session.require();
  const bundle = await campaigns.bundle();
  const shared = bundle.campaign.settings.shared;
  const sourceIds = shared.sourceIds.filter((id) => options.sourceIds.includes(id));
  const collectionIds = shared.collectionIds.filter((id) => options.collectionIds.includes(id));
  const campaign = {
    ...bundle.campaign,
    settings: { ...bundle.campaign.settings, shared: { ...shared, sourceIds, collectionIds } },
  };
  // No table, so no NPC is held: creatures go only from the companion list and NPC companions.
  const content = await loadShared(
    { catalog, index, homebrew },
    campaign,
    view,
    bundle.npcs,
    new Set(),
    store.getSettings().collections,
  );

  // The imported sources this campaign uses or shares that the pack leaves out, by name.
  const imported = (await catalog.list()).filter(
    (s) => (s.kind === 'xml' || s.kind === 'open5e') && sourceShowsIn(s, view),
  );
  const summary = (await campaigns.list()).find((c) => c.id === bundle.campaign.id);
  const used = summary
    ? await campaignsUsing(
        store,
        [summary],
        imported.map((s) => s.id),
      )
    : new Map<string, string[]>();
  const included = new Set(sourceIds);
  const sourcesNotIncluded = imported
    .filter((s) => !included.has(s.id))
    .filter((s) => shared.sourceIds.includes(s.id) || (used.get(s.id)?.length ?? 0) > 0)
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b));

  const manifest = await writePlayerPack(
    target,
    {
      campaignId: bundle.campaign.id,
      campaignName: bundle.campaign.name,
      preferredEdition: bundle.campaign.preferredEdition === '2014' ? '2014' : '2024',
      allowLegacy: bundle.campaign.allowLegacy,
      createdAt: nowIso(),
      sourcesNotIncluded,
      appVersion,
    },
    content,
  );
  return { records: manifest.records };
}

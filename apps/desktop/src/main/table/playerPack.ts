import { rename } from 'node:fs/promises';
import yazl from 'yazl';
import { z } from 'zod';
import { IsoDateTime, JoinedCampaignId } from '@trifold/schema';
import { readAllEntries } from '../campaign/campaignPackage';
import { writeZipTo } from '../zipWrite';
import type { SharedContent } from './sharedContent';

/**
 * Player packs (docs/PLAYER-MODE.md, "Player packs"; ADR 0064): a `.trifold-players` file a GM
 * hands out before the first session, when GM and players are not yet on the same network. It
 * holds what a campaign shares with its players, in the form a player's Trifold keeps it (the
 * records the table would send), and enough about the campaign to join it later. Trifold sends
 * it nowhere; the GM passes it on however they like.
 */

export const PLAYER_PACK_KIND = 'trifold-players';
export const PLAYER_PACK_VERSION = 1;
export const PLAYER_PACK_EXTENSION = 'trifold-players';

/** More than this in a pack is not one campaign's shared content. */
const PACK_MAX_BYTES = 128 * 1024 * 1024;

export const PlayerPackManifest = z.object({
  kind: z.literal(PLAYER_PACK_KIND),
  version: z.literal(PLAYER_PACK_VERSION),
  campaignId: JoinedCampaignId,
  campaignName: z.string().max(200),
  preferredEdition: z.enum(['2024', '2014']).catch('2024'),
  allowLegacy: z.boolean().catch(true),
  createdAt: IsoDateTime,
  /** The shared content's hash; a player's Trifold holding the same has nothing to do. */
  hash: z.string().max(64),
  records: z.number().int().min(0),
  /** Imported sources the campaign uses that the pack leaves out, by name, so a player who owns one knows to import it. */
  sourcesNotIncluded: z.array(z.string().max(200)).max(500).catch([]),
  /** The app version that wrote it, for diagnosing. */
  appVersion: z.string().max(40).catch(''),
});
export type PlayerPackManifest = z.infer<typeof PlayerPackManifest>;

/** Writes a pack to `target`, atomically: a partial file never takes the name. */
export async function writePlayerPack(
  target: string,
  manifest: Omit<PlayerPackManifest, 'kind' | 'version' | 'hash' | 'records'>,
  content: SharedContent,
): Promise<PlayerPackManifest> {
  const full: PlayerPackManifest = {
    kind: PLAYER_PACK_KIND,
    version: PLAYER_PACK_VERSION,
    ...manifest,
    hash: content.hash,
    records: content.records.length,
  };
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(JSON.stringify(full, null, 2), 'utf8'), 'manifest.json');
  const lines = content.records.map((r) => JSON.stringify(r));
  zip.addBuffer(Buffer.from(lines.length ? `${lines.join('\n')}\n` : '', 'utf8'), 'records.jsonl');
  zip.end();
  const partial = `${target}.partial`;
  await writeZipTo(zip, partial);
  await rename(partial, target);
  return full;
}

/**
 * Reads a pack: its manifest, checked, and its records as they stand in the file. The records
 * are the player's Trifold's to check one by one (`cleanShared`) before it keeps any.
 */
export async function readPlayerPack(
  path: string,
): Promise<{ manifest: PlayerPackManifest; records: unknown[] }> {
  let entries: Map<string, Buffer>;
  try {
    entries = await readAllEntries(path);
  } catch {
    throw new Error('That file is not a player pack.');
  }
  const total = [...entries.values()].reduce((n, b) => n + b.length, 0);
  if (total > PACK_MAX_BYTES) throw new Error('That player pack is too large.');
  const rawManifest = entries.get('manifest.json');
  let parsed: unknown = null;
  try {
    parsed = rawManifest ? JSON.parse(rawManifest.toString('utf8')) : null;
  } catch {
    parsed = null;
  }
  const manifest = PlayerPackManifest.safeParse(parsed);
  if (!manifest.success) {
    const kind = (parsed as { kind?: unknown } | null)?.kind;
    throw new Error(
      kind === PLAYER_PACK_KIND
        ? 'That player pack was made by a newer Trifold.'
        : 'That file is not a player pack.',
    );
  }
  const records: unknown[] = [];
  for (const line of (entries.get('records.jsonl')?.toString('utf8') ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch {
      // A broken line is one record lost, not the pack.
    }
  }
  return { manifest: manifest.data, records };
}

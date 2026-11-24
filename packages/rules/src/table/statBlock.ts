import type { TableStatBlock } from './types';

/**
 * Where a player's Trifold finds a stat block the table names (docs/PLAYER-MODE.md, "My
 * characters and Sheets"). The GM's Trifold sends a companion's, summon's or held NPC's stat
 * block as shared content (ADR 0060), under the joined campaign's shared source with the GM's
 * record id inside its own; the bundled SRD is never sent, since every Trifold has it.
 */

/** The start of a joined campaign's shared source id on the player's side. */
export const SHARED_SOURCE_PREFIX = 'shared:';

/** The id of the source a joined campaign's shared content lives in. */
export const sharedSourceId = (campaignId: string): string =>
  `${SHARED_SOURCE_PREFIX}${campaignId}`;

/** The record id a stat block has in a player's Library: its shared copy's, or the SRD's own. */
export function statBlockRecordId(campaignId: string, statBlock: TableStatBlock): string {
  return statBlock.recordId.startsWith('srd-')
    ? statBlock.recordId
    : `${sharedSourceId(campaignId)}:${statBlock.recordId}`;
}

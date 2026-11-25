import { z } from 'zod';
import { IsoDateTime } from './common';

/**
 * A joined campaign (docs/PLAYER-MODE.md): a campaign this Library plays in, run by a GM's
 * Trifold elsewhere. It is a local shell that points at the GM's table, never a copy of the
 * GM's campaign: `joined/<campaignId>/joined.json`, with the player's own notes beside it.
 */
export const JOINED_SCHEMA_VERSION = 1;

/**
 * The GM's campaign id, which also names the folder. It arrives from the network, so it is held
 * to characters that are safe in a path before anything is made of it.
 */
export const JoinedCampaignId = z.string().regex(/^[0-9A-Za-z_-]{1,64}$/);

/**
 * A table's address as the player connects to it: a host and a port, `192.168.1.23:8130` or
 * `trifold.local:80`. IPv6 hosts are in brackets.
 */
export const TableAddress = z.string().regex(/^(\[[0-9A-Fa-f:.]+\]|[0-9A-Za-z.-]{1,253}):\d{1,5}$/);

export const JoinedCampaign = z.object({
  schemaVersion: z.literal(JOINED_SCHEMA_VERSION),
  campaignId: JoinedCampaignId,
  campaignName: z.string().default(''),
  /** The name the GM's device list shows for this player. */
  displayName: z.string().max(40).default(''),
  /**
   * Addresses that worked, most recent first: the fallback when the network blocks the search
   * for the table (PLAYER-MODE.md, "Finding the table again").
   */
  addresses: z.array(TableAddress).max(8).default([]),
  /**
   * The device token the GM's table gave this Library for this campaign: the claim. It is the
   * player's own secret, the one a phone keeps in its browser; it travels with the Library, so a
   * restored backup is the same device. Never logged.
   */
  deviceToken: z.string().min(1).max(64).optional(),
  /** The player's character linked to the one they hold at this table (`characters/<id>.json`). */
  characterId: z.string().nullable().default(null),
  /**
   * The last sheet update the GM answered (ADR 0071), accepted or dismissed, as the offer's key:
   * the same numbers are not offered again.
   */
  sheetAnswered: z.string().max(8000).nullable().default(null),
  joinedAt: IsoDateTime,
  /** When this Library was last connected to the campaign's table. */
  lastLiveAt: IsoDateTime.nullable().default(null),
  /** When the player last opened this campaign's console, connected or not: the lists' order. */
  openedAt: IsoDateTime.nullable().default(null),
});
export type JoinedCampaign = z.infer<typeof JoinedCampaign>;

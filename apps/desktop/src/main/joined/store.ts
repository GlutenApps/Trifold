import { readdir, rm } from 'node:fs/promises';
import {
  JOINED_SCHEMA_VERSION,
  JoinedCampaign,
  JoinedCampaignId,
  TableAddress,
} from '@trifold/schema';
import type { LibraryStore } from '../library/LibraryStore';

/** How many working addresses a joined campaign remembers. */
const ADDRESSES_KEPT = 4;

/**
 * The Library's joined campaigns (docs/PLAYER-MODE.md): one folder each under `joined/`, named
 * by the GM's campaign id, with `joined.json` inside. Every write goes through `LibraryStore`.
 * Nothing here touches the network.
 */
export class JoinedStore {
  constructor(private readonly store: LibraryStore) {}

  private file(campaignId: string): string {
    // The id names a folder, and it came from the network: refuse anything but a plain name.
    return `joined/${JoinedCampaignId.parse(campaignId)}/joined.json`;
  }

  /** Every joined campaign, most recently live first, then by name. Unreadable ones are skipped. */
  async list(): Promise<JoinedCampaign[]> {
    let names: string[];
    try {
      names = await readdir(this.store.resolvePath('joined'));
    } catch {
      return [];
    }
    const out: JoinedCampaign[] = [];
    for (const name of names) {
      const joined = JoinedCampaignId.safeParse(name).success ? await this.get(name) : null;
      // A folder renamed by hand is not the campaign its file says it is.
      if (joined && joined.campaignId === name) out.push(joined);
    }
    return out.sort(
      (a, b) =>
        (b.lastLiveAt ?? '').localeCompare(a.lastLiveAt ?? '') ||
        a.campaignName.localeCompare(b.campaignName),
    );
  }

  async get(campaignId: string): Promise<JoinedCampaign | null> {
    try {
      return await this.store.readJson(this.file(campaignId), JoinedCampaign, 'joined');
    } catch {
      return null;
    }
  }

  /**
   * Joins a campaign, or joins it again: an existing shell keeps its token, its character and
   * its notes, and takes the new name, display name and address.
   */
  async join(input: {
    campaignId: string;
    campaignName: string;
    displayName: string;
    address?: string;
    now?: Date;
  }): Promise<JoinedCampaign> {
    const existing = await this.get(input.campaignId);
    const next = JoinedCampaign.parse({
      ...(existing ?? {
        schemaVersion: JOINED_SCHEMA_VERSION,
        campaignId: input.campaignId,
        joinedAt: (input.now ?? new Date()).toISOString(),
      }),
      campaignName: input.campaignName,
      displayName: input.displayName.trim().slice(0, 40),
      addresses: withAddress(existing?.addresses ?? [], input.address),
    });
    await this.store.writeJson(this.file(next.campaignId), next);
    return next;
  }

  /** Changes a joined campaign's own fields. Resolves to null when it is not joined. */
  async update(
    campaignId: string,
    patch: Partial<
      Pick<JoinedCampaign, 'campaignName' | 'displayName' | 'deviceToken' | 'characterId'>
    >,
  ): Promise<JoinedCampaign | null> {
    const existing = await this.get(campaignId);
    if (!existing) return null;
    const next = JoinedCampaign.parse({ ...existing, ...patch });
    await this.store.writeJson(this.file(campaignId), next);
    return next;
  }

  /** Records a connection that worked: its address goes first, and the campaign was live now. */
  async connected(
    campaignId: string,
    address: string,
    now: Date = new Date(),
  ): Promise<JoinedCampaign | null> {
    const existing = await this.get(campaignId);
    if (!existing) return null;
    const next = JoinedCampaign.parse({
      ...existing,
      addresses: withAddress(existing.addresses, address),
      lastLiveAt: now.toISOString(),
    });
    await this.store.writeJson(this.file(campaignId), next);
    return next;
  }

  /** Leave campaign: the whole shell goes, the player's notes in it included. */
  async leave(campaignId: string): Promise<void> {
    const dir = this.store.resolvePath(`joined/${JoinedCampaignId.parse(campaignId)}`);
    await rm(dir, { recursive: true, force: true });
  }
}

/** `address` first, the rest after it without repeats; an address that does not parse is ignored. */
function withAddress(addresses: readonly string[], address: string | undefined): string[] {
  if (!address || !TableAddress.safeParse(address).success) return [...addresses];
  return [address, ...addresses.filter((a) => a !== address)].slice(0, ADDRESSES_KEPT);
}

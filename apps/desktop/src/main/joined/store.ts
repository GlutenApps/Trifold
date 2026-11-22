import { readdir, rm } from 'node:fs/promises';
import { ulid } from 'ulid';
import type { ZodType } from 'zod';
import {
  CAMPAIGN_SCHEMA_VERSION,
  JOINED_SCHEMA_VERSION,
  JoinedCampaign,
  JoinedCampaignId,
  Note,
  nowIso,
  PinnedRoll,
  TableAddress,
  type FileKind,
} from '@trifold/schema';
import { quickNoteTitle } from '@trifold/rules';
import type { LibraryStore } from '../library/LibraryStore';

/** The player's own files in a joined campaign, one JSON file each. */
type OwnFolder = 'notes' | 'pinnedRolls';

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

  /** Keeps an address the player typed, first among those to try. Null when not joined. */
  async addAddress(campaignId: string, address: string): Promise<JoinedCampaign | null> {
    const existing = await this.get(campaignId);
    if (!existing) return null;
    const next = JoinedCampaign.parse({
      ...existing,
      addresses: withAddress(existing.addresses, address),
    });
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

  // ---------- the player's own notes and pinned rolls ----------

  /**
   * A file of the player's in a joined campaign. Both ids name a path and reach here from the
   * renderer, so each is held to a plain name first.
   */
  private own(campaignId: string, folder: OwnFolder, id?: string): string {
    const dir = `joined/${JoinedCampaignId.parse(campaignId)}/${folder}`;
    return id === undefined ? dir : `${dir}/${JoinedCampaignId.parse(id)}.json`;
  }

  private async readOwn<T>(
    campaignId: string,
    folder: OwnFolder,
    schema: ZodType<T>,
    kind: FileKind,
  ): Promise<T[]> {
    const dir = this.own(campaignId, folder);
    let files: string[];
    try {
      files = await readdir(this.store.resolvePath(dir));
    } catch {
      return [];
    }
    const out: T[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        out.push(await this.store.readJson(`${dir}/${file}`, schema, kind));
      } catch {
        // One unreadable file does not hide the rest.
      }
    }
    return out;
  }

  /** Nothing is written into a campaign this Library has left, which would bring it back. */
  private async mustBeJoined(campaignId: string): Promise<void> {
    if (!(await this.get(campaignId))) throw new Error('This Library has not joined that campaign');
  }

  /** The player's notes in a joined campaign, newest first. They are flat: no folders. */
  async notes(campaignId: string): Promise<Note[]> {
    const notes = await this.readOwn(campaignId, 'notes', Note, 'note');
    return notes.sort((a, b) =>
      (b.capture?.at ?? b.createdAt).localeCompare(a.capture?.at ?? a.createdAt),
    );
  }

  /** Saves a note of the player's; one with no id is new, stamped as captured now. */
  async saveNote(campaignId: string, input: Note): Promise<Note> {
    await this.mustBeJoined(campaignId);
    const at = nowIso();
    const title = quickNoteTitle(input.title);
    if (!title) throw new Error('A note needs a title');
    const note = Note.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      kind: 'note',
      title,
      parentId: null,
      role: undefined,
      capture: input.capture ?? { at: input.createdAt || at },
      createdAt: input.createdAt || at,
      updatedAt: at,
    });
    await this.store.writeJson(this.own(campaignId, 'notes', note.id), note);
    return note;
  }

  async removeNote(campaignId: string, id: string): Promise<void> {
    await rm(this.store.resolvePath(this.own(campaignId, 'notes', id)), { force: true });
  }

  /** The rolls the player pinned in a joined campaign, in the order they were pinned. */
  async pinnedRolls(campaignId: string): Promise<PinnedRoll[]> {
    const pins = await this.readOwn(campaignId, 'pinnedRolls', PinnedRoll, 'pinnedRoll');
    return pins.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Pins a roll (no id) or renames one, as a running campaign does. */
  async savePinnedRoll(campaignId: string, input: PinnedRoll): Promise<PinnedRoll> {
    await this.mustBeJoined(campaignId);
    const at = nowIso();
    const pin = PinnedRoll.parse({
      ...input,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      id: input.id || ulid(),
      name: input.name.trim() || input.label || 'Roll',
      createdAt: input.createdAt || at,
      updatedAt: at,
    });
    await this.store.writeJson(this.own(campaignId, 'pinnedRolls', pin.id), pin);
    return pin;
  }

  async removePinnedRoll(campaignId: string, id: string): Promise<void> {
    await rm(this.store.resolvePath(this.own(campaignId, 'pinnedRolls', id)), { force: true });
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

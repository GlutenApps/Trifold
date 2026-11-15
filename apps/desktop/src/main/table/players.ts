import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ulid } from 'ulid';
import {
  CAMPAIGN_SCHEMA_VERSION,
  PlayersFile,
  type PlayerClaim,
  type PlayerDevice,
} from '@trifold/schema';
import type { CreatureKind, ReclaimMode } from '@trifold/api';
import type { LibraryStore } from '../library/LibraryStore';

/** A new device token: 128 random bits, base64url (docs/PLAYER-CONNECTOR.md, First claim). */
export function newDeviceToken(): string {
  return randomBytes(16).toString('base64url');
}

/** SHA-256 of a token, hex. Only this is stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of a presented token against a stored hash. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A PIN's stored form: a random salt and its scrypt hash, hex, `salt:hash`. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

export function pinMatches(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, 'hex');
  const got = scryptSync(pin, Buffer.from(salt, 'hex'), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

const empty = (): PlayersFile => ({
  schemaVersion: CAMPAIGN_SCHEMA_VERSION,
  devices: [],
  claims: [],
  reclaimMode: 'open',
  movement: { all: false, creatures: [] },
});

/**
 * `campaigns/<slug>/players.json` (ADR 0043): devices and claims for one campaign, written only
 * here, through `LibraryStore`'s atomic write. Every change is saved before it is answered.
 */
export class PlayersStore {
  private data: PlayersFile = empty();

  private constructor(
    private readonly store: LibraryStore,
    private readonly relative: string,
  ) {}

  /** Loads the campaign's file; a missing or unreadable one starts empty. */
  static async open(store: LibraryStore, relative: string): Promise<PlayersStore> {
    const out = new PlayersStore(store, relative);
    try {
      out.data = await store.readJson(relative, PlayersFile, 'players');
    } catch {
      out.data = empty();
    }
    return out;
  }

  get devices(): readonly PlayerDevice[] {
    return this.data.devices;
  }

  get claims(): readonly PlayerClaim[] {
    return this.data.claims;
  }

  get reclaimMode(): ReclaimMode {
    return this.data.reclaimMode;
  }

  get movement(): { all: boolean; creatures: string[] } {
    return this.data.movement;
  }

  /** Lock movement (Phase 3): for everyone, or one creature (`kind:id`). */
  async setMovementLock(target: 'all' | string, locked: boolean): Promise<void> {
    const m = this.data.movement;
    const movement =
      target === 'all'
        ? { ...m, all: locked }
        : {
            ...m,
            creatures: locked
              ? [...new Set([...m.creatures, target])]
              : m.creatures.filter((k) => k !== target),
          };
    this.data = { ...this.data, movement };
    await this.save();
  }

  async setReclaimMode(mode: ReclaimMode): Promise<void> {
    if (mode === this.data.reclaimMode) return;
    this.data = { ...this.data, reclaimMode: mode };
    await this.save();
  }

  /** The device a token belongs to, compared in constant time against every stored hash. */
  deviceForToken(token: string): PlayerDevice | null {
    let found: PlayerDevice | null = null;
    for (const d of this.data.devices) {
      if (tokenMatches(token, d.tokenHash) && !found) found = d;
    }
    return found;
  }

  claimOf(kind: CreatureKind, id: string): PlayerClaim | null {
    return this.data.claims.find((c) => c.creatureKind === kind && c.creatureId === id) ?? null;
  }

  /**
   * Claims an unclaimed creature for a device, creating the device when it has no token yet.
   * Returns the new token for a new device (the only time a raw token exists), or null.
   */
  async claim(
    kind: CreatureKind,
    id: string,
    device: PlayerDevice | null,
    label: string,
    now: Date = new Date(),
    options: { pin?: string; takeOver?: boolean } = {},
  ): Promise<{ device: PlayerDevice; token: string | null; from: string | null }> {
    const held = this.claimOf(kind, id);
    if (held && !options.takeOver) throw new Error('already claimed');
    let token: string | null = null;
    let owner = device;
    if (!owner) {
      token = newDeviceToken();
      owner = {
        deviceId: ulid(),
        tokenHash: hashToken(token),
        label: label.trim().slice(0, 40),
        lastSeen: now.toISOString(),
      };
      this.data = { ...this.data, devices: [...this.data.devices, owner] };
    }
    // A reclaim keeps the PIN the first claim set, unless a new one comes with it.
    const pinHash = options.pin ? hashPin(options.pin) : held?.pinHash;
    const claim: PlayerClaim = {
      creatureKind: kind,
      creatureId: id,
      deviceId: owner.deviceId,
      claimedAt: now.toISOString(),
      ...(pinHash ? { pinHash } : {}),
    };
    const others = this.data.claims.filter(
      (c) => !(c.creatureKind === kind && c.creatureId === id),
    );
    this.data = { ...this.data, claims: [...others, claim] };
    await this.save();
    return { device: owner, token, from: held?.deviceId ?? null };
  }

  /** Releases one creature, or every claim. Creature files are never touched. */
  async release(target: { kind: CreatureKind; id: string } | 'all'): Promise<boolean> {
    const before = this.data.claims.length;
    const claims =
      target === 'all'
        ? []
        : this.data.claims.filter(
            (c) => !(c.creatureKind === target.kind && c.creatureId === target.id),
          );
    if (claims.length === before) return false;
    this.data = { ...this.data, claims };
    await this.save();
    return true;
  }

  /** Releases everything one device holds (Switch character); returns what it held. */
  async releaseDevice(deviceId: string): Promise<PlayerClaim[]> {
    const held = this.data.claims.filter((c) => c.deviceId === deviceId);
    if (!held.length) return [];
    this.data = { ...this.data, claims: this.data.claims.filter((c) => c.deviceId !== deviceId) };
    await this.save();
    return held;
  }

  /** Records when a device was last connected. Saved with the next change or on stop. */
  touch(deviceId: string, now: Date = new Date()): void {
    this.data = {
      ...this.data,
      devices: this.data.devices.map((d) =>
        d.deviceId === deviceId ? { ...d, lastSeen: now.toISOString() } : d,
      ),
    };
  }

  async save(): Promise<void> {
    await this.store.writeJson(this.relative, this.data);
  }
}

import { isRevealed, tokenCentre } from '../fog';
import type {
  Claim,
  ReclaimMode,
  ClientMap,
  ClientToken,
  ClientView,
  AnyCreatureKind,
  CreatureView,
  PickerEntry,
  SummonMode,
  TableCreature,
  TableSnapshot,
  TableToken,
} from './types';

/**
 * The paths the server serves a device's pictures under. Only things in that device's view get a
 * path, so a client never learns a file name or the art of something it cannot see.
 */
export const tablePaths = {
  map: (sceneId: string, fogKey: string) =>
    `/map/${encodeURIComponent(sceneId)}/${encodeURIComponent(fogKey)}.jpg`,
  tokenArt: (tokenId: string, src: string) =>
    `/t/${encodeURIComponent(tokenId)}/art?v=${shortHash(src)}`,
  screenImage: (sceneId: string, src: string) =>
    `/screen/${encodeURIComponent(sceneId)}/image?v=${shortHash(src)}`,
  tokenGlyph: (tokenId: string, src: string) =>
    `/t/${encodeURIComponent(tokenId)}/glyph?v=${shortHash(src)}`,
  portrait: (kind: AnyCreatureKind, id: string, src: string) =>
    `/c/${kind}/${encodeURIComponent(id)}/portrait?v=${shortHash(src)}`,
};

/** A short FNV-1a hash, so a changed picture gets a new URL and is never served from cache. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

import { creatureKey, movementLocked, type MovementLocks } from './movement';

/** The creature keys a device holds. */
export function claimedBy(claims: readonly Claim[], deviceId: string | null): Set<string> {
  const out = new Set<string>();
  if (!deviceId) return out;
  for (const c of claims) {
    if (c.deviceId === deviceId) out.add(creatureKey(c.creatureKind, c.creatureId));
  }
  return out;
}

/** What a device holds: its claims, and the summons of the creatures it holds. */
export function heldBy(
  snapshot: TableSnapshot,
  claims: readonly Claim[],
  deviceId: string | null,
): Set<string> {
  const out = claimedBy(claims, deviceId);
  for (const c of snapshot.creatures) {
    const owner = c.summon?.owner;
    if (owner && out.has(creatureKey(owner.kind, owner.id))) out.add(creatureKey('summon', c.id));
  }
  return out;
}

/** The owner whose movement lock and claim a creature follows: a summon's owner, else itself. */
export function controller(c: Pick<TableCreature, 'kind' | 'id' | 'summon'>): {
  kind: 'pc' | 'npc';
  id: string;
} {
  if (c.summon) return c.summon.owner;
  return { kind: c.kind as 'pc' | 'npc', id: c.id };
}

/**
 * Whether a device may see a token on the live map (ADR 0043; PLAYER-CONNECTOR.md, "Server-side
 * filtering"): never a hidden one;
 * a token whose centre is under fog only for the device that owns it.
 */
export function tokenVisibleTo(
  token: TableToken,
  snapshot: TableSnapshot,
  mine: ReadonlySet<string>,
): { visible: boolean; fogged: boolean; owned: boolean } {
  const owned = !!token.creature && mine.has(creatureKey(token.creature.kind, token.creature.id));
  if (token.hidden || !snapshot.scene) return { visible: false, fogged: false, owned };
  const fog = snapshot.scene.fog;
  const fogged = !isRevealed(fog, tokenCentre(token, snapshot.scene.grid));
  return { visible: !fogged || owned, fogged, owned };
}

/** The token ids a device may see, for serving art: the same rule as the view. */
export function visibleTokenIds(
  snapshot: TableSnapshot,
  claims: readonly Claim[],
  deviceId: string | null,
): Set<string> {
  const mine = heldBy(snapshot, claims, deviceId);
  const out = new Set<string>();
  if (!mine.size) return out;
  for (const t of snapshot.scene?.tokens ?? []) {
    if (tokenVisibleTo(t, snapshot, mine).visible) out.add(t.id);
  }
  return out;
}

/**
 * What one device receives (docs/PLAYER-CONNECTOR.md, "Server-side filtering"): its own
 * creatures in full; other visible tokens' place, label, role and picture only; nothing hidden
 * and nothing under fog except its own tokens. A device holding nothing sees the picker and no
 * map. `hasImage` says whether the server holds the fogged map image for the scene's fog state.
 */
export function viewFor(
  snapshot: TableSnapshot,
  claims: readonly Claim[],
  deviceId: string | null,
  hasImage: boolean,
  options: {
    reclaimMode?: ReclaimMode;
    /** Devices connected now. */
    online?: ReadonlySet<string>;
    movement?: MovementLocks;
    /** Tokens being dragged: token id → the dragging device's id and name. */
    dragging?: ReadonlyMap<string, { deviceId: string; label: string }>;
    /** Summoning's mode and cap; the options come from the snapshot. */
    summoning?: { mode: SummonMode; cap: number };
  } = {},
): ClientView {
  const reclaimMode = options.reclaimMode ?? 'open';
  const online = options.online ?? new Set<string>();
  const movement = options.movement ?? { all: false, creatures: [] };
  const dragging = options.dragging ?? new Map();
  const mineKeys = heldBy(snapshot, claims, deviceId);
  const known = new Set(snapshot.creatures.map((c) => creatureKey(c.kind, c.id)));
  const holding = [...mineKeys].filter((k) => known.has(k));

  if (!holding.length) {
    const holder = new Map(
      claims.map((c) => [creatureKey(c.creatureKind, c.creatureId), c.deviceId]),
    );
    const picker: PickerEntry[] = snapshot.creatures
      .filter(
        (c): c is TableCreature & { kind: 'pc' | 'npc' } => c.claimable && c.kind !== 'summon',
      )
      .map((c) => ({
        kind: c.kind,
        id: c.id,
        name: c.name,
        ...(c.portraitSrc ? { portraitUrl: tablePaths.portrait(c.kind, c.id, c.portraitSrc) } : {}),
        inUse: holder.has(creatureKey(c.kind, c.id)),
        holderOnline: online.has(holder.get(creatureKey(c.kind, c.id)) ?? ''),
      }));
    return { campaignName: snapshot.campaignName, mine: [], picker, map: null, reclaimMode };
  }

  const scene = snapshot.scene;
  const tokens: ClientToken[] = [];
  const tokenOf = new Map<string, string>();
  for (const t of scene?.tokens ?? []) {
    const seen = tokenVisibleTo(t, snapshot, mineKeys);
    if (!seen.visible) continue;
    if (seen.owned && t.creature) {
      const key = creatureKey(t.creature.kind, t.creature.id);
      if (!tokenOf.has(key)) tokenOf.set(key, t.id);
    }
    tokens.push({
      id: t.id,
      kind: t.kind,
      x: t.x,
      y: t.y,
      footprint: t.footprint,
      label: t.label,
      role: t.role,
      dead: t.dead,
      ...(t.color ? { color: t.color } : {}),
      ...(t.artSrc ? { artUrl: tablePaths.tokenArt(t.id, t.artSrc) } : {}),
      ...(t.glyphSrc ? { glyphUrl: tablePaths.tokenGlyph(t.id, t.glyphSrc) } : {}),
      mine: seen.owned,
      ...(seen.fogged ? { fogged: true } : {}),
      ...(dragging.get(t.id) && dragging.get(t.id)!.deviceId !== deviceId
        ? { movingBy: dragging.get(t.id)!.label }
        : {}),
    });
  }

  const map: ClientMap | null = scene
    ? {
        id: scene.id,
        title: scene.title,
        width: scene.width,
        height: scene.height,
        backdrop: scene.backdrop,
        ...(scene.hasImage && hasImage ? { imageUrl: tablePaths.map(scene.id, scene.fogKey) } : {}),
        grid: scene.grid,
        fog: scene.fog ? scene.fog.shapes : null,
        tokenStyle: scene.tokenStyle,
        tokens,
      }
    : null;

  const mine: CreatureView[] = snapshot.creatures
    .filter((c) => mineKeys.has(creatureKey(c.kind, c.id)))
    .map((c) => {
      const tokenId = tokenOf.get(creatureKey(c.kind, c.id));
      return {
        kind: c.kind,
        id: c.id,
        name: c.name,
        ...(c.portraitSrc ? { portraitUrl: tablePaths.portrait(c.kind, c.id, c.portraitSrc) } : {}),
        hp: c.hp,
        ac: c.ac,
        conditions: c.conditions,
        inFight: c.inFight,
        needsInitiative: c.needsInitiative,
        editable: c.editable,
        movementLocked: movementLocked(movement, controller(c).kind, controller(c).id),
        ...(c.companionOf ? { companionOf: c.companionOf } : {}),
        ...(c.summon ? { summon: c.summon } : {}),
        ...(tokenId ? { tokenId } : {}),
      };
    });

  const screen = snapshot.screen ?? null;
  return {
    campaignName: snapshot.campaignName,
    mine,
    picker: [],
    map,
    screen:
      screen?.kind === 'image'
        ? {
            kind: 'image',
            id: screen.id,
            title: screen.title,
            imageUrl: tablePaths.screenImage(screen.id, screen.src),
            width: screen.width,
            height: screen.height,
          }
        : screen,
    reclaimMode,
    ...(options.summoning
      ? { summoning: { ...options.summoning, options: snapshot.summonOptions ?? [] } }
      : {}),
  };
}

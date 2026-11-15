import { isRevealed, tokenCentre } from '../fog';
import type {
  Claim,
  ReclaimMode,
  ClientMap,
  ClientToken,
  ClientView,
  CreatureKind,
  CreatureView,
  PickerEntry,
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
  tokenGlyph: (tokenId: string, src: string) =>
    `/t/${encodeURIComponent(tokenId)}/glyph?v=${shortHash(src)}`,
  portrait: (kind: CreatureKind, id: string, src: string) =>
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

const creatureKey = (kind: CreatureKind, id: string) => `${kind}:${id}`;

/** The creature keys a device holds. */
export function claimedBy(claims: readonly Claim[], deviceId: string | null): Set<string> {
  const out = new Set<string>();
  if (!deviceId) return out;
  for (const c of claims) {
    if (c.deviceId === deviceId) out.add(creatureKey(c.creatureKind, c.creatureId));
  }
  return out;
}

/**
 * Whether a device may see a token on the live map (ADR 0043, decision 12): never a hidden one;
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
  const mine = claimedBy(claims, deviceId);
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
  reclaimMode: ReclaimMode = 'open',
  online: ReadonlySet<string> = new Set(),
): ClientView {
  const mineKeys = claimedBy(claims, deviceId);
  const known = new Set(snapshot.creatures.map((c) => creatureKey(c.kind, c.id)));
  const holding = [...mineKeys].filter((k) => known.has(k));

  if (!holding.length) {
    const holder = new Map(
      claims.map((c) => [creatureKey(c.creatureKind, c.creatureId), c.deviceId]),
    );
    const picker: PickerEntry[] = snapshot.creatures
      .filter((c) => c.claimable)
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
        ...(tokenId ? { tokenId } : {}),
      };
    });

  return { campaignName: snapshot.campaignName, mine, picker: [], map, reclaimMode };
}

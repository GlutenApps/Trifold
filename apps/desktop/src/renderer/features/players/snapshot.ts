import {
  iconUrl,
  type PresenterState,
  type TableSnapshot,
  type TableToken,
  type TokenStyle,
} from '@trifold/api';
import { activeFog, fogKey, isClaimable, type Role } from '@trifold/rules';
import type { CombatState, Combatant, NPC, PCCard, Scene, Token } from '@trifold/schema';
import { DEFAULT_GRID, mapSize } from '../presenter/mapMath';

/**
 * What the table may see, built from the console's stores and pushed to main (ADR 0043). Main
 * filters it per device with `viewFor`; nothing here is sent to a browser as is.
 *
 * - The scene is the map live on the TV (phones follow the TV), or none while the TV shows a
 *   title or image scene, nothing, or a blackout.
 * - Creatures are the PC cards and NPCs flagged player-controllable. Their numbers come from
 *   their combatant in the loaded fight, else from the PC card or the NPC's carried HP.
 * - Whether a creature is offered (decision 13) is decided here, where the live scene's roles
 *   and the fight are known.
 */
export interface SnapshotInput {
  campaign: { id: string; name: string; tokenStyle: TokenStyle };
  pcs: readonly PCCard[];
  npcs: readonly NPC[];
  presenter: Pick<PresenterState, 'blackout' | 'scene'>;
  liveScene: Scene | null;
  combat: CombatState | null;
  /** A token's picture (ADR 0033), as a `trifold-media://` URL. */
  artFor(token: Token): string | undefined;
  /** A campaign-relative portrait path as a `trifold-media://` URL. */
  portraitUrl(path: string): string;
}

const creatureOf = (ref: Token['ref']): TableToken['creature'] =>
  ref.kind === 'pc'
    ? { kind: 'pc', id: ref.pcId }
    : ref.kind === 'npc'
      ? { kind: 'npc', id: ref.npcId }
      : undefined;

const conditionText = (c: Combatant['conditions'][number]) =>
  c.level ? `${c.name} ${c.level}` : c.name;

/** The live map scene the phones may follow, or null. */
export function tableScene(input: SnapshotInput): TableSnapshot['scene'] {
  const { presenter, liveScene, combat } = input;
  const live = presenter.scene;
  if (presenter.blackout || !live || !liveScene || live.id !== liveScene.id) return null;
  if (liveScene.kind !== 'map' && liveScene.kind !== 'blankGrid') return null;
  if (liveScene.kind === 'map' && !liveScene.image) return null;
  const grid = liveScene.grid ?? DEFAULT_GRID;
  const size = mapSize(liveScene);
  const fog = activeFog(liveScene.fog);
  const deadTokens = new Set(
    (combat?.combatants ?? []).filter((c) => c.dead && c.tokenId).map((c) => c.tokenId!),
  );
  return {
    id: liveScene.id,
    title: liveScene.title,
    width: size.width,
    height: size.height,
    backdrop: liveScene.backdrop ?? (liveScene.kind === 'blankGrid' ? 'parchment' : 'dark'),
    hasImage: !!liveScene.image,
    grid: {
      cellPx: grid.cellPx,
      offsetX: grid.offsetX,
      offsetY: grid.offsetY,
      color: grid.color,
      opacity: grid.opacity,
      visible: grid.showToPlayers,
    },
    fog: fog ? { enabled: true, shapes: fog.shapes } : null,
    fogKey: fogKey(fog),
    tokenStyle: input.campaign.tokenStyle,
    tokens: liveScene.tokens.map((t) => {
      const art = input.artFor(t);
      const creature = creatureOf(t.ref);
      return {
        id: t.id,
        kind: t.kind,
        x: t.x,
        y: t.y,
        footprint: t.footprint,
        label: t.kind === 'creature' && t.nameMasked ? (t.maskedLabel ?? 'Creature') : t.label,
        role: t.role,
        hidden: t.hidden,
        dead: t.dead || deadTokens.has(t.id),
        ...(t.color ? { color: t.color } : {}),
        ...(art ? { artSrc: art } : {}),
        ...(t.glyph ? { glyphSrc: iconUrl(t.glyph) } : {}),
        ...(creature ? { creature } : {}),
      };
    }),
  };
}

export function tableSnapshotFrom(input: SnapshotInput): TableSnapshot {
  const scene = tableScene(input);
  const combatants = input.combat?.combatants ?? [];
  const fighterFor = (kind: 'pc' | 'npc', id: string) =>
    combatants.find((c) =>
      kind === 'pc'
        ? c.ref.kind === 'pc' && c.ref.pcId === id
        : c.ref.kind === 'npc' && c.ref.npcId === id,
    );
  const rolesFor = (id: string): Role[] => [
    ...(input.liveScene?.tokens ?? [])
      .filter((t) => t.ref.kind === 'npc' && t.ref.npcId === id)
      .map((t) => t.role),
    ...combatants.filter((c) => c.ref.kind === 'npc' && c.ref.npcId === id).map((c) => c.role),
  ];
  const creatures: TableSnapshot['creatures'] = [];
  for (const pc of input.pcs) {
    if (!pc.playerControllable) continue;
    const f = fighterFor('pc', pc.id);
    creatures.push({
      kind: 'pc',
      id: pc.id,
      name: pc.name,
      ...(pc.portrait ? { portraitSrc: input.portraitUrl(pc.portrait) } : {}),
      claimable: isClaimable('pc', true, []),
      hp: f
        ? { current: f.hp.current, max: f.hp.max, temp: f.hp.temp }
        : { current: pc.currentHp ?? pc.maxHp, max: pc.maxHp, temp: pc.tempHp ?? 0 },
      ac: f?.ac ?? pc.ac,
      conditions: f ? f.conditions.map(conditionText) : [],
    });
  }
  for (const npc of input.npcs) {
    if (!npc.playerControllable) continue;
    const f = fighterFor('npc', npc.id);
    creatures.push({
      kind: 'npc',
      id: npc.id,
      name: npc.name,
      ...(npc.portrait ? { portraitSrc: input.portraitUrl(npc.portrait) } : {}),
      claimable: isClaimable('npc', true, rolesFor(npc.id)),
      hp: f
        ? { current: f.hp.current, max: f.hp.max, temp: f.hp.temp }
        : npc.hp
          ? { current: npc.hp.current, max: npc.hp.max, temp: npc.hp.temp }
          : null,
      ac: f?.ac ?? null,
      conditions: f ? f.conditions.map(conditionText) : [],
    });
  }
  return { campaignId: input.campaign.id, campaignName: input.campaign.name, scene, creatures };
}

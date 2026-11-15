import { ulid } from 'ulid';
import type { TableSummonEvent } from '@trifold/api';
import { activeFog, freeCellsNear, summonExpired, summonLabels } from '@trifold/rules';
import type { Scene, Token } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { useIconStore } from '../../stores/iconStore';
import { usePresenterStore } from '../../stores/presenterStore';
import { useSceneStore } from '../../stores/sceneStore';
import { DEFAULT_GRID, footprintForSize, mapSize } from '../presenter/mapMath';

/**
 * Player summoning on the console (ADR 0043, Phase 4). Main has checked the request; here a summon
 * becomes tokens beside its owner on the live map and, in a fight, combatants; and summons go
 * when they are dismissed, when their rounds run out, or when the fight ends (unless they stay).
 */

/** The scene that holds a token: the editor's draft first, then the campaign's copy. */
function sceneWith(tokenId: string): Scene | undefined {
  const draft = useSceneStore.getState().draft;
  if (draft?.tokens.some((t) => t.id === tokenId)) return draft;
  return useCampaignStore
    .getState()
    .current?.scenes.find((s) => s.tokens.some((t) => t.id === tokenId));
}

/**
 * Changes summon tokens in one patch per scene. Saves land later, so two patches in the same
 * moment would each start from the same scene and the second would undo the first; batching
 * keeps several summons going (or being marked) at once from losing all but one.
 */
function patchSummonTokens(ids: ReadonlySet<string>, fn: (t: Token) => Token | null): void {
  const byScene = new Map<string, Scene>();
  for (const id of ids) {
    const scene = sceneWith(id);
    if (scene) byScene.set(scene.id, scene);
  }
  for (const sceneId of byScene.keys()) {
    useSceneStore.getState().patchScene(sceneId, (s) => ({
      ...s,
      tokens: s.tokens.flatMap((t) => {
        if (!ids.has(t.id)) return [t];
        const next = fn(t);
        return next ? [next] : [];
      }),
    }));
  }
}

function removeTokens(ids: ReadonlySet<string>): void {
  if (ids.size) patchSummonTokens(ids, () => null);
}

/** Every summon token in the campaign, with its scene. */
function allSummons(): Array<{ scene: Scene; token: Token }> {
  const draft = useSceneStore.getState().draft;
  const scenes = (useCampaignStore.getState().current?.scenes ?? []).map((s) =>
    draft?.id === s.id ? draft : s,
  );
  return scenes.flatMap((scene) =>
    scene.tokens.filter((t) => t.summon).map((token) => ({ scene, token })),
  );
}

/** Places a summon beside its owner on the live map, and in the loaded fight. */
export async function spawnSummons(
  event: Extract<TableSummonEvent, { kind: 'spawn' }>,
): Promise<number> {
  const campaign = useCampaignStore.getState().current;
  const option = campaign?.campaign.settings.summonable.find(
    (e) => e.ref.recordId === event.optionKey,
  );
  const stored = usePresenterStore.getState().liveSource?.scene;
  const draft = useSceneStore.getState().draft;
  const scene = stored && draft?.id === stored.id ? draft : stored;
  if (!option || !scene || (scene.kind !== 'map' && scene.kind !== 'blankGrid')) return 0;
  const owner = scene.tokens.find(
    (t) =>
      (event.ownerKind === 'pc'
        ? t.ref.kind === 'pc' && t.ref.pcId === event.ownerId
        : t.ref.kind === 'npc' && t.ref.npcId === event.ownerId) && !t.hidden,
  );
  if (!owner) return 0;
  const grid = scene.grid ?? DEFAULT_GRID;
  const size = mapSize(scene);
  const footprint = footprintForSize(option.size);
  const cells = freeCellsNear(
    owner,
    footprint,
    event.count,
    scene.tokens,
    {
      cols: Math.floor((size.width - grid.offsetX) / grid.cellPx),
      rows: Math.floor((size.height - grid.offsetY) / grid.cellPx),
    },
    activeFog(scene.fog),
    grid,
  );
  if (!cells.length) return 0;
  const labels = summonLabels(
    option.name,
    cells.length,
    scene.tokens.map((t) => t.label),
  );
  const combat = useCombatStore.getState();
  const fight = combat.state;
  const ownerFighter = fight?.combatants.find((c) =>
    event.ownerKind === 'pc'
      ? c.ref.kind === 'pc' && c.ref.pcId === event.ownerId
      : c.ref.kind === 'npc' && c.ref.npcId === event.ownerId,
  );
  // The creature as it is now, in case it was edited since it went on the list.
  const fresh = await window.trifold.compendium.get(option.ref.recordId).catch(() => null);
  const stats =
    fresh?.kind === 'monster'
      ? { hp: fresh.data.hp?.average ?? option.hp, ac: fresh.data.ac?.value ?? option.ac }
      : { hp: option.hp, ac: option.ac };
  const glyph = useIconStore
    .getState()
    .glyphForCreature(
      { name: option.name, ...(option.type ? { type: option.type } : {}) },
      'creature',
    );
  const hp = stats.hp ?? 1;
  const tokens: Token[] = cells.map((cell, i) => ({
    id: ulid(),
    kind: 'creature',
    ref: { kind: 'record', ref: option.ref, name: option.name },
    label: labels[i]!,
    x: cell.x,
    y: cell.y,
    footprint: footprint as Token['footprint'],
    role: 'ally',
    hidden: false,
    nameMasked: false,
    dead: false,
    ...(glyph ? { glyph } : {}),
    summon: {
      ownerKind: event.ownerKind,
      ownerId: event.ownerId,
      spawnedBy: event.deviceLabel,
      type: option.type,
      hp: { current: hp, max: hp, temp: 0 },
      ac: stats.ac ?? 10,
      initiative: event.initiative,
      // Rounds count in a fight; outside one a summon lasts until dismissed.
      ...(event.rounds && fight ? { expiresAtRound: fight.round + event.rounds } : {}),
      concentration: event.concentration,
      concentrationLost: false,
      persistent: event.persistent,
    },
  }));
  useSceneStore
    .getState()
    .patchScene(scene.id, (s) => ({ ...s, tokens: [...s.tokens, ...tokens] }));
  if (fight) {
    const initiative = event.initiative === 'shared' ? (ownerFighter?.initiative ?? null) : null;
    for (const token of tokens) await combat.addSummon(token, initiative, event.deviceLabel);
  }
  return tokens.length;
}

/** Dismiss a summon: its token and combatant go; nothing in the campaign is deleted. */
export function dismissSummon(tokenId: string, why: string): void {
  dismissSummons([tokenId], why);
}

function dismissSummons(tokenIds: readonly string[], why: string): void {
  for (const id of tokenIds) useCombatStore.getState().removeByToken(id, why);
  removeTokens(new Set(tokenIds));
}

/** Keep a summon after its owner's concentration broke: the question goes away. */
export function keepSummon(tokenId: string): void {
  patchSummonTokens(new Set([tokenId]), (t) =>
    t.summon ? { ...t, summon: { ...t.summon, concentrationLost: false } } : t,
  );
}

export function handleSummonEvent(event: TableSummonEvent): void {
  if (event.kind === 'spawn') void spawnSummons(event);
  else if (event.kind === 'dismiss')
    dismissSummon(event.tokenId, `is dismissed by ${event.deviceLabel}`);
  else keepSummon(event.tokenId);
}

/**
 * Summon upkeep while the console runs: when a round passes, summons whose rounds are up go;
 * when an owner's concentration breaks, summons tied to it are marked so the phone asks; when a
 * fight ends, summons that do not stay go. Returns the unsubscribe.
 */
export function installSummonUpkeep(): () => void {
  return useCombatStore.subscribe((s, prev) => {
    const now = s.state;
    const before = prev.state;
    if (now && before && now.round > before.round) {
      const expired = allSummons()
        .filter(({ token }) => summonExpired(token.summon!.expiresAtRound, now.round))
        .map(({ token }) => token.id);
      if (expired.length) dismissSummons(expired, 'is gone: its time ran out');
    }
    if (now && before) {
      for (const c of now.combatants) {
        const was = before.combatants.find((x) => x.id === c.id);
        if (!was?.concentrating || c.concentrating) continue;
        const ownerKind = c.ref.kind === 'pc' ? 'pc' : c.ref.kind === 'npc' ? 'npc' : null;
        const ownerId =
          c.ref.kind === 'pc' ? c.ref.pcId : c.ref.kind === 'npc' ? c.ref.npcId : null;
        if (!ownerKind || !ownerId) continue;
        const tied = allSummons()
          .filter(({ token }) => {
            const sm = token.summon!;
            return (
              sm.concentration &&
              !sm.concentrationLost &&
              sm.ownerKind === ownerKind &&
              sm.ownerId === ownerId
            );
          })
          .map(({ token }) => token.id);
        if (tied.length) {
          patchSummonTokens(new Set(tied), (t) =>
            t.summon ? { ...t, summon: { ...t.summon, concentrationLost: true } } : t,
          );
        }
      }
    }
    if (s.finished && s.finished !== prev.finished) {
      removeTokens(
        new Set(
          allSummons()
            .filter(({ token }) => !token.summon!.persistent)
            .map(({ token }) => token.id),
        ),
      );
    }
  });
}

import type { TableIntentEvent } from '@trifold/api';
import type { Combatant } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { useSceneStore } from '../../stores/sceneStore';

/**
 * Applies a player's change that main has checked (PLAYER-CONNECTOR.md, "How a player's edit
 * travels").
 * It goes through the same store actions a DM click uses, in the console's one thread, so player
 * and DM edits apply in order: in the loaded fight to the combatant (damage still asks for
 * concentration and death saves), outside it to the PC card or the NPC's carried HP. HP and temp
 * HP arrive as changes, so a DM's damage and a player's healing both count.
 */
export function applyTableIntent(event: TableIntentEvent): void {
  const { creatureKind: kind, creatureId: id, intent } = event;
  const combat = useCombatStore.getState();
  // A summon's id is its token's: its combatant is the one tied to that token.
  const fighter: Combatant | undefined = combat.state?.combatants.find((c) =>
    kind === 'summon'
      ? c.tokenId === id
      : kind === 'pc'
        ? c.ref.kind === 'pc' && c.ref.pcId === id
        : c.ref.kind === 'npc' && c.ref.npcId === id,
  );
  if (kind === 'summon' && !fighter) return applyToSummonToken(id, intent);
  const campaign = useCampaignStore.getState();
  const pc = kind === 'pc' ? campaign.current?.pcs.find((p) => p.id === id) : undefined;
  const npc = kind === 'npc' ? campaign.current?.npcs.find((n) => n.id === id) : undefined;
  if (!pc && !npc && !fighter) return;

  if (fighter) {
    const f = fighter.id;
    combat.fromDevice(event.deviceLabel, () => {
      switch (intent.kind) {
        case 'hp':
          if (intent.delta < 0) combat.damage(f, -intent.delta);
          else combat.heal(f, intent.delta);
          return;
        case 'temp':
          combat.setTempHp(f, Math.max(0, fighter.hp.temp + intent.delta));
          return;
        case 'setTemp':
          combat.setTempHp(f, intent.value);
          return;
        case 'maxHp':
          combat.setMaxHp(f, intent.value);
          return;
        case 'ac':
          combat.setAc(f, intent.value);
          return;
        case 'addCondition':
          combat.addCondition(f, intent.name, undefined, intent.level);
          return;
        case 'removeCondition':
          combat.removeCondition(f, intent.id);
          return;
        case 'initiative':
          // Only while it is still empty: if the DM typed it first, theirs stands
          // (PLAYER-CONNECTOR.md, "Initiative").
          if (fighter.initiative === null) combat.setInitiative(f, intent.value);
          return;
      }
    });
    // Max HP and AC belong to the PC card too, so the next fight starts from them.
    if (pc && (intent.kind === 'maxHp' || intent.kind === 'ac')) {
      void campaign.savePc({ ...pc, [intent.kind]: intent.value });
    }
    return;
  }

  if (pc) {
    const current = pc.currentHp ?? pc.maxHp;
    switch (intent.kind) {
      case 'hp': {
        // Damage takes temp HP first, as the tracker does in a fight.
        const temp = pc.tempHp ?? 0;
        const absorbed = intent.delta < 0 ? Math.min(temp, -intent.delta) : 0;
        void campaign.savePc({
          ...pc,
          currentHp: Math.min(pc.maxHp, Math.max(0, current + intent.delta + absorbed)),
          tempHp: temp - absorbed,
        });
        return;
      }
      case 'setTemp':
        void campaign.savePc({ ...pc, tempHp: intent.value });
        return;
      case 'temp':
        void campaign.savePc({ ...pc, tempHp: Math.max(0, (pc.tempHp ?? 0) + intent.delta) });
        return;
      case 'maxHp':
        void campaign.savePc({
          ...pc,
          maxHp: intent.value,
          ...(pc.currentHp !== undefined
            ? { currentHp: Math.min(pc.currentHp, intent.value) }
            : {}),
        });
        return;
      case 'ac':
        void campaign.savePc({ ...pc, ac: intent.value });
        return;
      default:
        // Conditions and initiative only exist in a fight; main refuses them outside one.
        return;
    }
  }

  if (npc?.hp) {
    const hp = npc.hp;
    if (intent.kind === 'hp') {
      const absorbed = intent.delta < 0 ? Math.min(hp.temp, -intent.delta) : 0;
      void campaign.saveNpc({
        ...npc,
        hp: {
          ...hp,
          current: Math.min(hp.max, Math.max(0, hp.current + intent.delta + absorbed)),
          temp: hp.temp - absorbed,
        },
      });
    } else if (intent.kind === 'setTemp') {
      void campaign.saveNpc({ ...npc, hp: { ...hp, temp: intent.value } });
    } else if (intent.kind === 'temp') {
      void campaign.saveNpc({ ...npc, hp: { ...hp, temp: Math.max(0, hp.temp + intent.delta) } });
    }
  }
}

/** A summon outside a fight keeps its HP and AC on its token. */
function applyToSummonToken(tokenId: string, intent: TableIntentEvent['intent']): void {
  const scenes = useSceneStore.getState();
  const draft = scenes.draft;
  const token =
    draft?.tokens.find((t) => t.id === tokenId) ??
    useCampaignStore
      .getState()
      .current?.scenes.flatMap((s) => s.tokens)
      .find((t) => t.id === tokenId);
  const summon = token?.summon;
  if (!summon) return;
  const hp = summon.hp;
  let next = summon;
  switch (intent.kind) {
    case 'hp': {
      const absorbed = intent.delta < 0 ? Math.min(hp.temp, -intent.delta) : 0;
      next = {
        ...summon,
        hp: {
          ...hp,
          current: Math.min(hp.max, Math.max(0, hp.current + intent.delta + absorbed)),
          temp: hp.temp - absorbed,
        },
      };
      break;
    }
    case 'temp':
      next = { ...summon, hp: { ...hp, temp: Math.max(0, hp.temp + intent.delta) } };
      break;
    case 'setTemp':
      next = { ...summon, hp: { ...hp, temp: intent.value } };
      break;
    case 'maxHp':
      next = {
        ...summon,
        hp: { ...hp, max: intent.value, current: Math.min(hp.current, intent.value) },
      };
      break;
    case 'ac':
      next = { ...summon, ac: intent.value };
      break;
    default:
      return;
  }
  scenes.patchTokenAnywhere(tokenId, { summon: next });
}

import type { SheetOffer, TableSheetEvent, TableSheetShareEvent } from '@trifold/api';
import type { Ability, PCCard } from '@trifold/schema';
import { useCampaignStore } from '../../stores/campaignStore';
import { useCombatStore } from '../../stores/combatStore';
import { blankPc } from '../campaign/CharacterEditors';

/**
 * Sheet updates on the GM's side (docs/PLAYER-MODE.md, Sheet updates; ADR 0071): what an offer
 * would change on a PC card, for the Player devices pop-up, and writing one the DM accepted.
 * The console is the only writer of PC files; main hands it accepted offers as events.
 */

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const signed = (n: number | undefined) => (n === undefined ? '—' : n >= 0 ? `+${n}` : String(n));

/** The PC card with an offer's numbers in it; play state (HP, conditions) is left alone. */
export function withSheetOffer(pc: PCCard, offer: SheetOffer): PCCard {
  const n = offer.numbers;
  const { spellSaveDc: _dc, sheetUrl: _url, ...rest } = pc;
  return {
    ...rest,
    name: offer.name,
    classText: n.classText,
    level: n.level,
    maxHp: n.maxHp,
    // A lower maximum takes current HP down with it; a higher one leaves the wound as it is.
    ...(pc.currentHp !== undefined ? { currentHp: Math.min(pc.currentHp, n.maxHp) } : {}),
    ac: n.ac,
    initiativeBonus: n.initiativeBonus,
    speed: n.speed,
    passives: { ...n.passives },
    saves: { ...n.saves },
    ...(n.spellSaveDc !== undefined ? { spellSaveDc: n.spellSaveDc } : {}),
    ...(offer.sheetUrl
      ? { sheetUrl: offer.sheetUrl }
      : pc.sheetUrl
        ? { sheetUrl: pc.sheetUrl }
        : {}),
  };
}

/** "Level 4 → 5", "Max HP 31 → 38": what accepting the offer would change on the card. */
export function sheetChanges(pc: PCCard, offer: SheetOffer): string[] {
  const n = offer.numbers;
  const out: string[] = [];
  const diff = (label: string, from: string | number, to: string | number) => {
    if (String(from) !== String(to)) out.push(`${label} ${from || '—'} → ${to || '—'}`);
  };
  diff('Name', pc.name, offer.name);
  diff('Class', pc.classText, n.classText);
  diff('Level', pc.level, n.level);
  diff('Max HP', pc.maxHp, n.maxHp);
  diff('AC', pc.ac, n.ac);
  diff('Initiative', signed(pc.initiativeBonus), signed(n.initiativeBonus));
  diff('Speed', pc.speed, n.speed);
  diff('Passive Perception', pc.passives.perception, n.passives.perception);
  diff('Passive Insight', pc.passives.insight, n.passives.insight);
  diff('Passive Investigation', pc.passives.investigation, n.passives.investigation);
  for (const a of ABILITIES)
    diff(`${a.toUpperCase()} save`, signed(pc.saves[a]), signed(n.saves[a]));
  diff('Spell save DC', pc.spellSaveDc ?? '—', n.spellSaveDc ?? '—');
  if (offer.sheetUrl && offer.sheetUrl !== pc.sheetUrl) out.push('A new character sheet link');
  return out;
}

/**
 * An accepted offer: written to the PC card, and to its combatant when it is in a fight. With no
 * PC, a new card is made from the offer and handed to the player who asked (ADR 0072).
 */
export async function applyTableSheet(event: TableSheetEvent): Promise<void> {
  const campaign = useCampaignStore.getState();
  if (event.pcId === null) {
    const made = await campaign.savePc(
      withSheetOffer({ ...blankPc(), maxHp: 10, ac: 10 }, event.offer),
    );
    if (made && event.requestId) await window.trifold.table.grantNewPc(event.requestId, made.id);
    return;
  }
  const pc = campaign.current?.pcs.find((p) => p.id === event.pcId);
  if (!pc) return;
  const next = withSheetOffer(pc, event.offer);
  void campaign.savePc(next);
  const combat = useCombatStore.getState();
  const fighter = combat.state?.combatants.find(
    (c) => c.ref.kind === 'pc' && c.ref.pcId === event.pcId,
  );
  if (!fighter) return;
  combat.fromDevice(event.deviceLabel, () => {
    if (fighter.hp.max !== next.maxHp) combat.setMaxHp(fighter.id, next.maxHp);
    if (fighter.ac !== next.ac) combat.setAc(fighter.id, next.ac);
  });
}

/**
 * A player's sheet shared for the PC card they hold (ADR 0078): kept on the card for the DM to
 * read, changing nothing else on it. Null takes it off, when the player unlinked it.
 */
export async function applyTableSheetShare(event: TableSheetShareEvent): Promise<void> {
  const campaign = useCampaignStore.getState();
  const pc = campaign.current?.pcs.find((p) => p.id === event.pcId);
  if (!pc) return;
  const { playerSheet: _old, ...rest } = pc;
  await campaign.savePc(
    event.character
      ? {
          ...rest,
          playerSheet: {
            character: event.character,
            from: event.deviceLabel.slice(0, 80),
            sharedAt: new Date().toISOString(),
          },
        }
      : rest,
  );
}

# ADR 0051 · CR scaler: Tune mode, the audit's fixes and legendary actions

**Status:** accepted, 2026-11-21. Amends ADR 0038 and ADR 0048.

## Context

The DM wants a scaled monster to fight like a real monster of its new CR: a CR 1/2 creature
scaled to CR 10 should feel like a CR 10, and the other way round. They also want to set
parts by hand: add one attack and nothing else, or keep a CR while trading damage for hit
points.

A fight-simulation audit (`scripts/cr-audit/`) tested this. Every SRD monster in both editions
was scaled to CRs 1/4–20 and fought by a party of four of the target's level. Each one was
judged by the share of the party's hit points it took, against the median real SRD 5.2 monster
of that CR. It also compared fight length, the chance a PC drops and the biggest single hit.
The scaler of ADR 0038 and ADR 0048 was within one CR step 54% of the time:

- Scaling up from CR 0–1/2 came out about two steps soft. The typical HP line gave 15 HP at
  CR 0, where real CR 0 creatures have about 4, and flat damage ("1 Piercing damage") never
  scaled.
- Scaling down to CR 1/4–1/2 came out one to two steps hard, because Multiattack and legendary
  actions were kept.
- Quick scale kept one attack, so a CR 10 wolf made one bite for 68: one hit could drop a PC.

## Decision

1. **Typical values below CR 1 are the SRD's own:** HP 4, 9, 13 and 20, and damage per round
   2, 4, 6 and 8, at CR 0, 1/8, 1/4 and 1/2. They meet the straight lines at CR 1.
2. **Flat damage scales.** It becomes dice once it is worth rolling: d4s while small, then d6s.
3. **Odd numbers move part of the way toward typical on a big step.** A monster keeps all of
   its own HP, AC and damage profile at a small step. That share falls by 1/12 per step on the
   CR list, down to 40% at twelve steps, so a 1-HP rat does not become a paper-thin CR 10.
4. **Attacks follow the new CR, in quick scale too.** A typical monster makes 1 attack below
   CR 3, 2 from CR 3 to 10, and 3 from CR 11 up. Scaling up adds attacks to reach that
   number, and scaling down removes them. The damage per round is shared across the attacks.
   This replaces ADR 0048 point 5 and the old step of 4 CR.
5. **Legendary actions follow the CR.**
   - **Scaling below CR 10** takes away legendary actions and Legendary Resistance.
   - **Scaling up past CR 10** adds legendary actions to a monster without them: 3 uses a
     round, Strike (one attack with its best attack) and Shift (move half its Speed without
     provoking Opportunity Attacks). From CR 16 it also adds Legendary Resistance (3/Day).
   - **The legendary actions share the damage budget.** Strike counts as 1.5 attacks a round,
     so each attack is smaller and the total matches the target.
   - A big step within CR 11+ (4 CR or more) offers them too.
6. **Scaling up past CR 10 adds an area attack** to a monster without one: *<Type> Burst
   (Recharge 5–6)*, a Dexterity save in a 20-foot Emanation, using the best attack's damage
   type and the target's save DC. Each creature caught takes about half a turn of attacks'
   damage, so it trades evenly with a turn of attacks and does not change the CR.
7. **Each change is a part with a tick box:** `attacks`, `legendary` and `area` sit beside the
   numbers. Unticking added legendary actions gives their share back to the attacks, so the CR
   stays the same. Keeping legendary actions below CR 10 counts half a step up.
8. **Tune mode** (the scaler's **Quick | Tune** switch) gives each part its own CR.
   - Hit points, armor class, damage, attack bonuses, save DCs and saving throws each have a
     − and + to move one CR step. Attacks per turn has its own stepper, and legendary actions
     and the area attack have tick boxes.
   - The challenge the parts add up to shows live, with the ADR 0048 weights.
   - **Balance** moves hit points to land back on the CR picked above, or moves damage when
     hit points were the last thing moved.
   - Tune works at the monster's own CR too, so the DM can add one attack and see what it is
     worth.
   - In `packages/rules`, a `TunePlan` gives each part a CR. `planFor` builds the plan quick
     scale and the tick boxes use, and `tuneCr` applies any plan.

9. **The CR is blended in steps on the CR list**, not in raw CR numbers. This amends ADR 0048
   point 3. Above CR 1 nothing changes; below it, moving 1/4 to 1/2 counts as a full step, as
   it does in the XP table and in the audit.

## Consequences

- In the audit, 75% of scaled monsters land within one CR step of their target, against 54%
  before; the typical miss fell from 0.89 to 0.51 steps. Scaling up to CR 12+ lands within
  +0.1 to +0.7 steps. At CR 12, 16 and 20, fight length and the chance a PC drops match real
  monsters. The biggest single hit is a little smaller than a real monster's, because the
  damage is spread over more attacks.
- The audit does not simulate spells, conditions or Legendary Resistance, and the SRD has few
  monsters above CR 12. Rerun `tsx scripts/cr-audit/scale.ts` after any change to the scaler.
- Added features use our own generic wording, and the homebrew save re-derives their attack,
  save and recharge buttons from the text.

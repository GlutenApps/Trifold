# ADR 0048 · The CR scaler's CR follows what is ticked

**Status:** accepted, 2026-11-20. Amends ADR 0038.

## Context

The CR scaler moved every ticked number to the chosen CR and always labelled the result with
that CR, whatever was left out. At a big step it offered one more attack, unticked, and when
ticked the damage was split across the attacks so damage per round stayed the same: an extra
attack, which the DMG treats as a large part of a monster's threat, changed nothing. A DM who
unticked hit points still got a monster called CR 10.

## Decision

1. **Every part starts ticked, the extra attack too.** Picking another CR ticks everything again.
2. **Each attack is its own roll.** At a step that offers an attack (4 CR or more), the target
   CR's damage per round is shared across the planned attacks, one more (or one fewer) than now.
   With the attack ticked the damage per round reaches the target; unticked, the other attacks
   keep their share, so the damage per round, and the CR, come out lower.
3. **The CR the monster ends at follows the ticked parts.** Each part lands at the target CR's
   typical value or stays at the starting CR's; damage per round counts the attacks made. The
   parts are blended by weight: hit points 35%, damage per round 35%, armor class 15%, attack
   bonus 7.5%, save DC 7.5% (defence and offence, hit points and damage weighing most, as in
   the DMG's method); saving throws and skills carry none. The result snaps to the nearest CR,
   and sets the monster's CR, XP, proficiency bonus and Scaled tag. With everything ticked it is
   the chosen CR exactly.
4. **The panel shows it.** The Challenge line reads the CR the ticked parts reach, with "CR 10
   with everything ticked" beside it when that is lower, and the button applies that CR.
5. **Quick scale keeps the number of attacks**, so its creatures land on the CR it picks.

## Consequences

- Unticking anything lowers the CR the monster ends at; a DM sees what each part is worth.
- The weights are a simple model, not the DMG's tables; they agree with the scaler's own
  baselines, so applying every part is exact.

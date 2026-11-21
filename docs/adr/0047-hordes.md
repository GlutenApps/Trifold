# ADR 0047 · Individuals and hordes

**Status:** accepted, 2026-11-20. Replaces the campaign's group initiative setting (DESIGN.md §6.4).

## Context

An encounter row with a quantity (Bandit ×4) made four combatants and four tokens, but by
default rolled one initiative for all of them: individuals on the map, a group in the turn
order. Testers read that as a bug. A DM who wants many creatures to act as one has no way to
say so, and the 5e rules have no horde rule to follow; "horde" is Trifold's own term.

## Decision

1. **Individuals are the default.** Each creature in a row has its own token, combatant, turn
   and initiative roll, in the builder and when added mid-fight. The campaign setting
   `initiativeMode` (per group or per creature) is removed; a saved one is ignored.
2. **Horde** is a switch on a row of a compendium creature with a quantity above 1 (the party
   icon on the row). A horde fights as one combatant named "Bandit horde" (masked "Humanoid
   horde"), with one token at least two squares across, one turn and one initiative roll.
3. **Hit points are pooled:** one member's HP (or the row's override) times the members. Members
   still standing are the HP left over one member's, rounded up; the tracker shows "3/4
   standing".
4. **One attack, damage per member standing.** Rolling one of the horde's attacks rolls its
   damage once for each member standing, as one roll ("1d6+2" for three members is "3d6+6";
   a crit doubles those dice). The log notes "(3 of 4 standing)". Multiattack is the DM's to
   leave aside, as the horde makes one attack.
5. **CR follows the members.** A horde shows the highest CR whose XP fits within its members'
   XP together (four CR 1/8 bandits, 100 XP: CR 1/2). Its XP, and so the encounter's difficulty,
   is the members' total either way.

## Consequences

- Copies of a creature no longer share an initiative by accident; a DM who wants them to act
  together makes them a horde.
- Custom creatures and NPCs always fight as individuals, since a horde needs a stat block.
- A horde cannot split back into individuals mid-fight; the DM ends the fight or adds
  individuals with Add to fight.

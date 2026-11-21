# ADR 0052 · Hordes: CR that fights true, attacks in threes, area damage per member

**Status:** accepted, 2026-11-21. Amends ADR 0047, replacing its points 4 and 5.

## Context

The DM wants a horde to feel like what its CR says: if a number of CR 1/2 creatures is called
CR 6, it should fight like a CR 6. Hordes are mainly for weaker creatures.

A fight-simulation audit (`scripts/cr-audit/horde.ts`) built hordes of 2–20 of every SRD
creature up to CR 5 and fought them against parties of four. It found:

- **The CR was too low.** ADR 0047's rule (the highest CR whose XP fits within the members' XP)
  put low-CR hordes about two CR steps under how they fight. Rats never left CR 0, because SRD
  rats store 0 XP.
- **One attack for every member at once felt wrong.** At ten or more members, one roll could
  drop a PC outright: the biggest hit was about 100% of a PC's hit points, where a real monster
  of the same CR hits for about 45%.
- **Area effects were too weak against a horde.** An area effect hit the pooled hit points
  once, so horde fights dragged on.

## Decision

1. **Horde CR is fitted to the audit.** Horde XP = 1.6 × (a member's XP)^0.85 × (members)^1.3,
   and the horde's CR is the one whose XP is nearest on a ratio scale, never below a member's
   own CR. A member's XP comes from its CR in the XP table, so a CR 0 creature counts 10 XP.
   Bigger members climb faster:

   | Members | CR 1/8 | CR 1/2 | CR 2 |
   |---|---|---|---|
   | 4 | 1 | 2 | 5 |
   | 13 | 3 | 6 | 12 |

2. **The horde's CR sets its XP.** The encounter budget and the XP earned count the XP of the
   horde's CR, not the members' XP added up (`templateXp`).
3. **A horde attacks once for every three members standing.** Each roll carries its group's
   damage, so eight standing make three rolls with 3, 3 and 2 members' damage. Each roll goes
   to the damage queue on its own, labelled "group 1", "group 2" and so on.
4. **An area effect hurts each member it catches.** When the DM assigns damage to a horde, the
   damage pop-up shows **Members in the area** under it, with a line saying what the field is
   for. Each member caught takes the damage, but no more than one member's hit points, and no
   more members are counted than are standing. The field starts at 1, which is a single attack
   on one member.
5. **The row warns about hordes of strong creatures.** A horde of CR 3 or higher creatures
   says on its row: "Hordes suit weaker creatures. With CR 3 or higher members it hits very
   hard; the difficulty bar shows how hard."
6. **An Impossible band.** From twice the High budget the difficulty bar shows **Impossible**,
   Trifold's own band like Trivial; the 2024 rules stop at High. The meter runs to just past
   that line, and the line is marked on it.

## Consequences

- In the audit, the CR shown is within one step of how the horde fights 73% of the time, with
  a median miss of 0. ADR 0047's rule put low-CR hordes about two steps low.
- With attacks in groups of three, the biggest hit matches real monsters at ten members or
  more. Small hordes still hit somewhat harder than a single monster.
- Hordes last longer than single monsters of the same CR: about 4.5 rounds against 3.2. This
  is the cost of pooled hit points, and it is only partly made up by area effects.
- The fit runs about one step high for hordes of CR 0 creatures: rats reach CR 1/2, not CR 1.
- A horde is still chosen in the builder and cannot be split mid-fight (ADR 0047).

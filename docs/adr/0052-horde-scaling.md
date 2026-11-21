# ADR 0052 · Hordes: CR that fights true, attacks in threes, swarms that bite

**Status:** accepted, 2026-11-21. Amends ADR 0047, replacing its points 4 and 5.

## Context

The DM wants a horde to feel like what its CR says: if a number of CR 1/2 creatures is called
CR 6, it should fight like a CR 6. Hordes are mainly for weaker creatures. For a party of four
1st-level characters, the DM's yardsticks are:

| Rats | Should feel |
|---|---|
| 1 | trivial |
| 10 | an annoyance |
| 20 | dangerous |
| 30 or more | deadly |

Five bandits should be a serious fight.

A fight-simulation audit (`scripts/cr-audit/horde.ts`) built hordes of 2–50 of every SRD
creature up to CR 5 and fought them against parties of four. It found:

- **The CR was too low.** ADR 0047's rule (the highest CR whose XP fits within the members' XP)
  put low-CR hordes about two CR steps under how they fight. Rats never left CR 0, because SRD
  rats store 0 XP.
- **One attack for every member at once felt wrong.** At ten or more members, one roll could
  drop a PC outright: the biggest hit was about 100% of a PC's hit points, where a real monster
  of the same CR hits for about 45%.
- **Area effects were too weak against a horde.** An area effect hit the pooled hit points
  once, so horde fights dragged on.
- **Hordes of tiny creatures were harmless at any size.** With pooled hit points, a sword hit
  of 9 felled nine 1-HP rats, and the rats bit for 1 each. Rat hordes stopped getting harder at
  about eight rats: 40 of them were only as hard as a CR 2 monster. Bandits already met the
  DM's yardsticks.
- **Multipliers on size do not fix this.** Multiplying a horde's hit points or damage by its
  size made rats dangerous, but it also pushed ten bandits to Impossible for a 1st-level party.

## Decision

1. **Horde CR is fitted to the audit, over hordes of 2 to 50.**
   - Horde XP = 1.75 × (a member's XP)^0.775 × (members)^1.5. The horde's CR is the one whose
     XP is nearest on a ratio scale, never below a member's own CR.
   - A member's XP comes from its CR in the XP table, so a CR 0 creature counts 10 XP.
   - Bigger members climb faster:

     | Members | CR 0 | CR 1/8 | CR 1/2 | CR 2 |
     |---|---|---|---|---|
     | 4 | 1/2 | 1 | 2 | 5 |
     | 10 | 2 | 3 | 5 | 10 |
     | 20 | 4 | 5 | 10 | 17 |
     | 50 | 8 | 11 | 19 | 25 |

2. **The horde's CR sets its XP.** The encounter budget and the XP earned count the XP of the
   horde's CR, not the members' XP added up (`templateXp`).
3. **A horde attacks once for every three members standing.** Each roll carries its group's
   damage, so eight standing make three rolls with 3, 3 and 2 members' damage. Each roll goes
   to the damage queue on its own, labelled "group 1", "group 2" and so on.
4. **Tiny creatures bite as a swarm.** A member whose attack averages 2 damage or less (a Rat's
   1) rolls 1d4 in a horde. A group of three rats hits for about 7, which is what the SRD's own
   Swarm of Rats bites for.
5. **One hit fells at most three members.** Damage to a horde from a single hit, after
   resistances, is capped at three members' hit points, so a sword stroke kills three rats, not
   nine. This only matters for creatures with fewer hit points than about a third of a hit. The
   log notes it, for example "3 to the horde, one hit fells at most 3".
6. **An area effect hurts each member it catches.**
   - When the DM assigns damage to a horde, the damage pop-up shows **Members in the area**
     under it, with a line saying what the field is for.
   - Each member caught takes the damage, but no more than one member's hit points, and no more
     members are counted than are standing.
   - The field starts at 1: a single hit, which fells at most three members.
7. **The row warns about hordes of strong creatures.** A horde of CR 3 or higher creatures
   says on its row: "Hordes suit weaker creatures. With CR 3 or higher members it hits very
   hard; the difficulty bar shows how hard."
8. **An Impossible band.** From twice the High budget the difficulty bar shows **Impossible**,
   Trifold's own band like Trivial; the 2024 rules stop at High. The meter runs to just past
   that line, and the line is marked on it.

## Consequences

- **The CR shown tracks how hordes fight.** In the audit, the CR shown matches how the median
  horde fights to within one step for every member CR and size it can measure, with a median
  miss of 0. ADR 0047's rule put low-CR hordes about two steps low. Individual creatures scatter
  more: 67% within one step. That figure includes hordes of CR 2+ creatures past CR 20, which
  the audit cannot place.
- **Rats now meet the DM's yardsticks** against a 1st-level party:

  | Rats | Fights like | Band |
  |---|---|---|
  | 10 | CR 1 | Low |
  | 20 | CR 2 | High |
  | 30 | CR 3 | High, at the edge of Impossible |
  | 40 | CR 5 | Impossible |

  Those fights take about 3–4 rounds, and up to 5 for 40–50 rats at higher levels. Bandits,
  goblins and stronger creatures fight as before.
- **For 10–20 rats the CR shown runs one step high,** on the safe side.
- **Big hits match real monsters.** With attacks in groups of three, the biggest single hit
  matches real monsters at ten members or more. Small hordes still hit somewhat harder than a
  single monster.
- **Hordes last longer** than single monsters of the same CR: about 4.3 rounds against 3.3.
  That is the cost of pooled hit points, and area effects only partly make up for it.
- **A horde is still chosen in the builder** and cannot be split mid-fight (ADR 0047).
- **Some SRD 5.2 creatures have no attack button** in the tracker (Rat, Bat, Cat and about 30
  others). Their attack text reads "1 Piercing damage" with no "Hit:", or "+5 (with Advantage
  if…)", and the importer does not read it. That gap is older than this ADR. Until it is fixed,
  the DM rolls those creatures' attacks by hand.

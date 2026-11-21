# ADR 0049 · Conditions between fights

**Status:** accepted, 2026-11-20. Extends ADR 0012 (what carries between fights).

## Context

Conditions lived only on combatants, so a phone could set them only during a fight and showed
"Conditions are tracked during fights" otherwise. At the table conditions outlast fights:
Exhaustion after a forced march, a curse, Poisoned from a trap between encounters. The player
connector listed this as not built yet.

## Decision

1. **PC cards, NPCs and companions keep conditions** (`conditions` on `PCCard`, `NPC` and a
   summon token's `summon`), the same records the tracker uses.
2. **Phones change them at any time.** Outside a fight a player's change goes to the card, the
   NPC or the companion's token; in a fight to the tracker, as before.
3. **They carry into and out of fights like HP.** A fighter starts with what its card carries;
   when the fight ends, the PC card and the NPC keep what the fighter ended with, and so does a
   companion that stays after the fight (its HP too, which it did not keep before).
4. **Durations only count in a fight.** A condition leaving a fight keeps its name and level and
   drops its rounds or save.
5. **Long rest** on the Party tab lowers Exhaustion by one level (gone at 0), as the 2024 rules
   say, and leaves other conditions alone; it now also counts a PC with Exhaustion as needing
   rest.
6. **The DM sees and edits them** on each PC and NPC row in the Campaign tab: a badge per
   condition with a remove button, and **+ Condition** to add one (Exhaustion goes up a level).
   Exhaustion is one condition with a level, so a new level replaces the old one.

## Consequences

- A condition set between fights is there when the next fight starts, on the phone and in the
  tracker.
- NPCs that are not in a fight have no other way to show a condition on the TV; overlays are
  unchanged.

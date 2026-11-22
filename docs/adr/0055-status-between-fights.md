# ADR 0055 · HP and conditions between fights, from the Campaign tab

**Status:** accepted, 2026-11-21. Extends ADR 0012 (what carries between fights) and ADR 0049.

## Context

ADR 0049 let phones change a PC's conditions outside a fight, and put a **+ Condition** dropdown
on every PC and NPC row in the Campaign tab for the DM. In use:

- The dropdown sat on every NPC row, story NPCs included, where it made no sense, and on a
  narrow panel it wrapped onto the row's actions.
- The DM could not change HP outside a fight at all, except **Long rest** (the whole party back
  to full) and **Restore** (an NPC back to full). A player's phone could already change their
  PC's HP, temp HP, max HP and AC at any time.

## Decision

1. **A status line under each row.** PC rows, and NPC rows with a stat block or HP carried
   from a fight, get a second line with the HP and the conditions. It wraps inside the panel. A
   story NPC with no stat block, no HP and no conditions shows none.
2. **HP is a button.** It reads "HP 24/31 +5" (in the warning colour when hurt), or "HP full"
   for an NPC that has not been hurt. Pressing it opens an editor under the row: an amount, then
   **Damage** (temp HP first, the tracker's rule), **Heal** (up to max), **Temp HP** (set; it does
   not stack) or **Set** (current HP). Enter is Damage, Shift+Enter is Heal, Escape closes. No
   dialog. An NPC that has not fought takes its max from its stat block's average.
3. **Conditions add from a plus.** The badges stay, each with its remove button; a **+** opens
   the condition list as a menu (Exhaustion says which level it adds). No dropdown sits on the
   row.
4. **Long rest and Restore stay.** Max HP, AC and the rest stay in the PC editor; death is the
   DM's call, so damage to 0 does not mark an NPC dead.

## Consequences

- The DM can do between fights what a player's phone already could, from the same rows.
- Rows read as two short lines instead of one that wraps unpredictably.
- What changes here goes into the next fight like any carried HP or condition (ADR 0012, 0049).

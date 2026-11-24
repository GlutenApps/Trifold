# ADR 0075 — Rolling from the sheet

**Status:** accepted, 2026-11-23. Item 7 of the schedule to release in `docs/PLAYER-MODE.md`, added to Part 3 by Ian on 2026-11-23. Extends ADR 0059 (table rolls).

## Context

A player at the table rolled from the Dice pop-up by typing or building an expression. The Sheets tab showed every number a roll needs (saves, skills, initiative, attacks, spell attack) as text. A table roll carried only its expression, so every roll log called it "1d20+7", not what it was for. Initiative went in by typing a number into the initiative box.

## Decision

- **The sheet's numbers roll.** On the read-only sheet in the player console (the Sheets tab), the following are buttons, underlined and named "Roll Stealth check" and so on:
  - initiative, each saving throw, each skill and the spell attack (a d20 plus the number);
  - an attack's bonus to hit;
  - its damage, the dice in the damage text.
- **Roll with** (Normal, Advantage, Disadvantage) applies to the next d20 roll only, then goes back to Normal.
- **The Table and Private switch is followed**, as for the Dice pop-up. With Table chosen at the table, the GM's Trifold makes the roll and every roll log shows it. Otherwise it is made on the player's computer and logged there. The newest roll shows under the switch.
- **`roll` gains two optional fields:**
  - `for` (up to 40 characters, "Stealth check"), which the table puts in front of the roll's label ("Stealth check: 1d20+7").
  - `initiative: { creatureKind, creatureId }`. The GM's Trifold enters the roll's total as that creature's initiative, through the same checks as an `initiative` intent: the device holds it and the fight waits for it.
- **Initiative.** The player's Trifold adds `initiative` only while the held character's fight is waiting for its initiative. A Private initiative roll sends its total as an `initiative` intent, as the box does.
- Phones and older messages are unchanged: both fields are optional, and a phone sends neither.

## Consequences

- One click rolls and, for initiative, enters the result: no typing at the table.
- Roll logs at the table say what each sheet roll was for.
- The Library's sheet editor does not roll; it has no table or roll log to send to.

# ADR 0083 — Spells at the table: upcasting, concentration, spell details

**Status:** accepted, 2026-11-25. Ian's call, from the character sheet dev list (docs/CHARACTER-SHEET.md, items 13 to 15).

## Context

Cast spent a slot of the spell's own level and nothing else. A player could not cast with a higher slot, nothing said what they were concentrating on, and a spell row showed only its name: whether it needs concentration or can be a ritual, how long it takes and how far it reaches all meant opening it.

## Decision

- **Spell details on the row.** A spell linked to the compendium shows its casting time and range ("1 action · 30 feet") and a **C** for concentration and an **R** for ritual, each with a tooltip. They are read from the record when the sheet shows it (`useSpellFacts`), cached for the session, and never written to the sheet. An unlinked spell shows only what the sheet has.
- **Cast is still one click.** It uses the lowest slot that is free at the spell's level or above. When the spell's own level is spent, it casts with the next level up, and its tooltip and the readout say so.
- **Cast with a higher slot** is a row action beside Cast, opening the slot levels above the one Cast would use, each with how many are left. It keeps its place on every spell row and is disabled, with the reason, where there is nothing higher or the spell is a cantrip (UI guidelines §8). The readout marks an upcast ("cast with a level 2 slot (upcast), 1 left").
- **Concentration.**
  - Casting a spell whose record says Concentration makes it what the character concentrates on (`sheet.concentrating`), saved with the sheet.
  - The turn bar shows it, with the Constitution save to roll and **End**.
  - Casting another concentration spell ends the first, and the readout says so ("concentrating now, Bless ends"). Cast's tooltip warns before you press it.
  - A long rest ends concentration; a short rest does not.
- `castSpell`, `slotChoices` and `endConcentration` in `packages/rules` do the work, as pure functions.

## Consequences

- An unlinked spell is never treated as needing concentration; linking it (adding it from the compendium) is how the sheet learns.
- Not done: prompting the concentration save when the table records damage, and ending concentration at 0 HP. Both need the table's HP events in the sheet. Higher-level effects (more damage, more targets) stay in the spell's text.

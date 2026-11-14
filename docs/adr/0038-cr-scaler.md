# ADR 0038 · The CR scaler: shift by the difference, same dice, a Scaled tag

**Status:** accepted, 2026-11-14. Builds Beta 8 (`DESIGN.md` §10) and replaces the "CR scaler"
sketch in §6.2.

## Context

A DM often wants a monster at another CR: a goblin boss for a level-7 party, a dragon for a
level-4 one. As far as we found, the 2024 rules no longer give a method; the 2014 DMG said to move
AC, hit points, attack bonus, damage per round and save DC toward a table of typical values per
CR. Community analyses of the 2024 Monster Manual agree that those five numbers rise roughly in
straight lines with CR (HP and damage faster past CR 20), and that ability scores, speeds and
features are left alone.

There are two styles: set every number to the CR's typical value (fast, but every monster comes
out the same shape), or shift each number by how much the typical value moves between the two
CRs (a tough, slow hitter stays one). Tools that let you change a monster's CR do the second.

## Decision

1. **Shift by the difference.** AC, attack bonuses and save DCs move by the change in the typical
   value; HP and damage scale by its ratio. Saving throw and skill bonuses move with the
   proficiency bonus. CR, XP and proficiency bonus take the new CR's values.
2. **Typical values are our own fit to the bundled SRD 5.2 monsters** (331 of them), not a copied
   table: AC 12.4 + 0.42 × CR, attack bonus 3.8 + 0.53 × CR, save DC 11.2 + 0.52 × CR, HP
   15 × (CR + 1) to CR 20 then 41 per CR, and damage per round 6 × (CR + 1) to CR 20 then 12 per
   CR. They match the published analyses. Only the ratio matters for HP and damage.
3. **Same dice, more or fewer of them.** A damage roll keeps its die size; its modifier moves with
   the ability score (the attack bonus change less the proficiency change) and the number of dice
   makes up the rest: 1d6 + 2 can become 2d6 + 5. Hit dice keep their size and Constitution bonus
   per die. Text is rewritten in place ("Hit: 6 (1d8 + 2)", "DC 12", "+4 to hit", "Attack Roll:
   +4", in either edition's phrasing), and Save re-reads it, so the tracker's buttons follow.
4. **An attack more or fewer is offered** at a step of 4 CR or more: one more attack in the
   Multiattack going up (a Multiattack is added when there was a single attack), one fewer going
   down. Each attack roll then carries its share of the damage; save effects such as a breath
   weapon scale on their own.
5. **The DM sees and chooses.** "Scale to another CR…" in the monster editor's Challenge section
   opens a panel: the new CR, each change as old → new, a checkbox per part (hit points, armor
   class, attack bonuses, save DCs, damage, saving throws and skills, the attack offer), and
   notes on what stays (spells, Legendary Resistance uses, fixed numbers in text). **Apply to
   the form** changes the form only; Save writes, through the Save step (ADR 0035).
6. **The name never changes** (it shows on the VTT). `MonsterData.scaled = { fromCr, toCr }`
   records it, kept from the first CR across repeated scaling and dropped when scaled back; the
   stat block shows a **Scaled CR 1/4 → 3** tag beside its CR.

## Consequences

- `scaleCr` in `packages/rules` is pure and tested; the panel only shows and applies it.
- Monsters whose text names numbers the scaler cannot read keep them; the notes say so.

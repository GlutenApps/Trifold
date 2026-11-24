# Character builder (2024): short spec

Status: agreed, 2026-11-23 (Ian's answers are under Decisions). `docs/PLAYER-MODE.md`, Part 3, Way 3 and phase 7 ask for this spec before the builder is built. It writes the same sheet a Trifold character already has (ADR 0068); everything here is about getting a correct sheet with fewer keystrokes.

## Goal

A player makes a 2024-rules character in a few minutes by choosing, not typing: class, origin (background and species), ability scores, equipment and spells, then a review. **Level up** later adds a level the same way. The result is an ordinary Trifold character: every number stays worked out and overridable, and anything the builder cannot describe is entered by hand on the sheet.

## Where the rules come from

Ground rule 3: no game text but the SRD fetched at build time. The builder's game text (class and species features, background traits, equipment lists, spell lists) comes only from bundled SRD 5.2.1 records, parsed at build time. Rules arithmetic lives in `packages/rules` as tables, as the CR and XP tables do: spell slots per level by caster type (Open5e's class table has no slot columns for full and half casters, only the caster type), the point-buy costs and the standard array.

What the snapshot holds today, and what it needs:

| Needed | Today | Change |
| --- | --- | --- |
| Class: hit die, saving throws, level features, ASI levels, subclass | In the class records | none |
| Class: skill choices ("Choose 2: …"), weapon and armour training, starting equipment (A/B) | Dropped: Open5e has them in a `CORE_TRAITS_TABLE` feature the normaliser skipped | `proficiency`, `numSkills`, `armor`, `weapons`, `tools`, `extra.equipment` (#108) |
| Class table columns: cantrips, prepared spells, Warlock slots, Rages, Weapon Mastery… | Dropped: `CLASS_TABLE_DATA` features | `extra["table:<column>"]`, one value per level (#108) |
| Spell slots for full and half casters | Not in the class table; the caster type is | A rules table by caster type in `packages/rules` |
| Background: three ability scores, feat, two skills, tool, equipment A/B | In the background traits, as text | Parse the traits at build time into typed fields |
| Species: size, speed, traits, choices (such as Draconic Ancestry) | In the species traits | Typed size and speed; traits stay text, with their choices offered as a pick where the text lists them |
| Standard array and point-buy costs | In the rules record "Step 3: Ability Scores" | Rules tables in `packages/rules`, checked against that record in a test |
| Spells by class | Spell records carry `classes` | none |
| Origin feats, fighting style feats | Feat records carry a prerequisite | Read the category from it |

Parsing lives in `packages/importers/src/open5e/` (build time) and the typed reading in `packages/rules/src/character/` (keyed by edition, so the 2014 builder is an addition). Each parser has a fixture with SRD text, per CLAUDE.md. A record the parser cannot read leaves that step to manual entry, with a warning, never an error.

## The flow

The SRD's own five steps, on the Sheets tab or Library › Characters. **New character** keeps its two kinds; a **Trifold character** then starts one of three ways: **Guided builder** (this flow), **Blank sheet** (the sheet filled in by hand, as today) or **Import from PDF** (phase 6, hidden until built). Each step can be revisited until Finish; nothing is written before Finish, then the result is a Trifold character.

1. **Class.** The 12 classes with hit die, primary ability and a one-line summary. Picks: skills (the class's "Choose n"), weapon mastery where the class has it, and a fighting style where it has one. A subclass is picked at the level that grants it (Level up), not here.
2. **Origin.** Background (its feat comes with it; a choice inside the feat, such as Magic Initiate's spell list, is offered), then species and its choices, then languages (Common plus two from the SRD list).
3. **Ability scores.** Standard array, point buy (27 points, the SRD costs), or rolled (4d6 drop lowest, rolled with Trifold's dice and shown). Then the background's increase: +2 and +1, or +1 to all three, among its three abilities. Scores and modifiers update as they change.
4. **Equipment.** The class's and the background's option A or B; B's gold is added to coins. Items are linked to their SRD records by name where one matches. Built: body armour and a shield set the sheet's armour (so its AC), and each weapon becomes an attack with the ability it uses (Dexterity for ranged, the better of Strength and Dexterity for finesse) and its damage with that modifier; coins are the sheet's `gp`.
5. **Spells** (casters only). Cantrips and prepared spells up to the class table's counts at 1st level, from the class's list, picked from the compendium with its filters. Spell slots come from the class table. Built: the step shows only for a class with cantrips or prepared spells at 1st level; the lists are the SRD spells whose classes name the class, cantrips and spells up to its highest slot level, with a filter; the sheet gains `slots` (by slot level), filled from the caster type and editable on the sheet.
6. **Review.** The sheet as it will be, numbers worked out: HP is the hit die's maximum plus Con at 1st level. Finish writes it.

## Level up

On a Trifold character made by the builder: **Level up** on the sheet (Edit mode). HP: the fixed value (half the die plus one, plus Con) or a roll. New features from the class table are added; the subclass is picked at its level; an ASI level offers +2/+1 or a feat; new cantrips, prepared spells and slots follow the table. A sheet update offer follows as for any change (ADR 0071). Built: **Level up** on the Trifold sheet of a character the builder made (it has `build`), as one panel: hit points fixed or rolled (with Con, at least 1), the new class and subclass features listed, the subclass at its level, at an ASI level +2 to one ability, +1 to two (none above 20) or a feat (origin and general feats other than Ability Score Improvement itself), and new cantrips and prepared spells up to the class table's counts; spell slots follow the class. The build record keeps the hit points, the subclass and each improvement.

## Data model

The sheet stays as it is. A character made by the builder also keeps `build`: the choices made (class and subclass by key, background, species and their choices, the ability method and base scores, the increase, skills, feats, equipment options, spells, and per level the HP gained and the ASI or feat). Level up reads it; editing the sheet by hand never needs it. `build` is additive, optional, no schema bump. Linked records use `SheetRef` (kind, key, name), so a sheet still reads if a record is gone.

## Legacy options

With a campaign's `allowLegacy` on, the background and species steps also list SRD 5.1 (2014) ones and imported ones. They are applied the way the 2024 rules apply older options: an older background gets the 2024 increase among any three abilities and an origin feat picked from the list; an older species keeps its traits and its listed increases are dropped in favour of the background's. Where the data cannot describe an option, the step says so and leaves it to the sheet.

## Not in the first version

- Multiclassing (Level up adds levels in the one class).
- Imported classes and subclasses (manual entry, as today).
- Encumbrance, attunement, coin purses.
- The 2014 builder (phase 8).

## Order of work (one PR each)

1. Snapshot: keep core traits and class table columns, parse backgrounds and the ability score tables; fixtures; `pnpm fetch:content` re-run.
2. Rules layer: typed class, background, species and ability-score readers in `packages/rules/src/character/`, keyed by edition.
3. The flow, steps 1 to 3 and Review, writing a sheet.
4. Equipment and spells.
5. Level up.
6. Legacy options.

## Decisions (Ian, 2026-11-23)

1. Names: **New character** offers External character or Trifold character; a Trifold character starts as **Guided builder**, **Blank sheet** or **Import from PDF**.
2. Multiclassing waits for a later version.
3. Ability scores: standard array, point buy and rolled.
4. Level up HP: fixed by default, or rolled.

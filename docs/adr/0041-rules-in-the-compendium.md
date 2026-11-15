# ADR 0041 · Rules in the compendium, from the SRD's rules chapters

**Status:** accepted, 2026-11-15. Builds Beta 11 (`DESIGN.md` §10) and the Rules kind sketched in
§6.7, which asked to verify first that the SRD documents carry the rules as separate sections.

## Context

At the table a DM looks up rules more than anything: what Dash does, how cover works, how far a
party travels in a day. The compendium had monsters, spells, items and conditions from the SRD
snapshot, but not the rules text. The snapshot comes from the Open5e v2 API at build time; it
files the rules chapters as *rulesets* (sections) with their rules nested, each rule's text in
markdown, for both SRD documents.

What we found when we checked:

- **SRD 5.1 (2014)**: 41 sections, from Actions in Combat (Dash, Dodge, Help, Search…) and Cover to
  Spellcasting, Traps and the planes; 239 rules. Six rules carry the name of the rule before them
  (the rule keyed `use-an-object` is named "Search"); their keys are right.
- **SRD 5.2.1 (2024)**: the play chapters, 11 sections (Combat, D20 Tests, Damage and Healing,
  Exploration, Proficiency, Multiclassing, Social Interaction…); 58 rules. Open5e does not carry
  the 2024 **Rules Glossary**, the A–Z list where the 2024 book defines Dash, Dodge, Help,
  Difficult Terrain and most other terms. Nothing in the snapshot holds that text cleanly.

## Decision

1. **A `rule` record kind** with `data: { text (markdown), section, order }`, one record per rule,
   and one for a section that has text but no rules of its own (2014 Cover). Ids are
   `<document>:rule:<Open5e key>`, like every other kind. Records collapse across editions by
   name like conditions, so Cover shows once with both editions behind it.
2. **Names stay as the book has them**, with two corrections: a name repeated within a section is
   taken from the rule's key ("Use an Object"), with a warning in the manifest; and a name shared by
   rules in different sections gets its section in front ("D20 Tests: Ability Checks",
   "Monsters: Reactions"), so each stays its own entry.
3. **The Compendium's Rules sub-tab** lists them with their section, searchable by name and text
   like any kind and found by global search. The detail shows the section under the name and the
   text as formatted markdown (headings, lists, bold, tables), read with the notes editor's Tiptap
   markdown reader set read-only, so no second markdown library joins the app.
4. **Rules are read, not edited.** They have no Edit and are not offered under New homebrew; house
   rules belong in notes, as §6.7 says.
5. **The 2024 Rules Glossary is left out** until a source carries it cleanly. A 2024 campaign
   still finds the 2014 versions of Dash, Dodge and the other actions under All editions.

## Consequences

- The snapshot grows by 297 records; the bundled sources re-index on their new hashes.
- `fetch-open5e.ts` reads `rulesets/` once and files each under its document.
- Compendium XML has no rules element; an imported file never adds rules.

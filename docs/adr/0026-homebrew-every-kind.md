# ADR 0026 · Homebrew for every kind, New homebrew in the Library, and a quieter record view

**Status:** accepted, 2026-11-11. Amends DESIGN.md §6.2 (editors other than the monster's were
M2, classes M3), ADR 0025 (Rebuild index sat on Sources) and the record view of DESIGN.md §6.1
(the Stat block / Source text toggle and the 2024 / Legacy toggle).

## Context

Only monsters could be homebrewed: Duplicate to homebrew showed on monsters alone, and there was
no way to start a record from nothing. The record view's Source text toggle repeated the text
the record already shows, and its edition toggle would not hold more than two versions or long
source names. Rebuild index, a repair the DM rarely needs, sat beside the main actions on Sources.

## Decision

- **Every kind has an editor:** monster (as before), spell, item, feat, species, background,
  condition and class. They are forms with the XML's field names; spells, items and feats edit
  their rolls (Save waits while a roll is not dice); species and backgrounds their traits; classes
  are built level by level with features (each optional or not), ability score improvement and
  spell slots. Subclasses are not modelled.
- **New homebrew** (primary, with a plus) in Library › Compendium's header opens an inline panel:
  a kind, **Start a blank …**, and a search to copy an existing record of that kind. A blank
  record lives only in the editor until Save; a copy is written at once, as Duplicate does.
- **Duplicate to homebrew** is on every record, at the right end of the detail bar where the
  Stat block / Source text toggle was. The toggle is gone; unknown XML elements are still kept on
  the record, just not listed in the view. The homebrew bar (Edit, Changes from original, Delete)
  shows on homebrew records only.
- **The edition switch is a dropdown** ("Switch edition"), each option the edition and the source
  name. A record with one version shows its edition badge instead.
- **Rebuild index moves to Settings › Library**, under the index status, with a line on when to
  use it and a report of what it rebuilt.
- Comma-separated fields in the editors keep the typed text, so a comma is not swallowed before
  the next word (it was, in the monster editor's damage and environment lists).

## Consequences

- DESIGN.md's M2 no longer lists homebrew editors; M3 keeps subclass editors.
- Export to XML (M2) will have every kind's homebrew to write.

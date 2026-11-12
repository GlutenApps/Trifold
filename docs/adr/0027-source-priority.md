# ADR 0027 · Source priority decides which version a compendium row shows; editors in sections

**Status:** accepted, 2026-11-11. Amends DESIGN.md §7.2 (the campaign's preferred edition chose
the row's version) and the compendium list's edition chips; refines ADR 0026's editors and New
homebrew panel.

## Context

A record in several places (the 2024 and legacy SRD, an imported book, homebrew) collapsed to one
row headed by the campaign's preferred edition, and the row carried a chip column per edition.
That did not let the DM say which source they trust, and a column per edition (or per source)
does not scale. The homebrew editors laid every field in one auto-filling grid, which read as a
jumble of mixed controls, and the record pane stopped at 820 px, leaving a gap in a wide window.

## Decision

- **Sources have a priority**, highest first, set by dragging a row's handle (or the arrow keys on the focused handle) on Library ›
  Compendium › Sources and saved as `LibrarySettings.sourcePriority` (additive with a default, no
  schema bump). Sources not in the saved list follow in the default order: homebrew, imported
  files by name, the 2024 SRD, the legacy SRD (`sourceOrder` in @trifold/rules). A new import
  joins at the bottom until the DM moves it.
- **The index carries each source's rank** (`sources.priority`, index version 3, rebuilt on
  next open) and applies it after every sync and whenever the order changes. Collapsed rows, the
  global search's compendium groups and the record's version dropdown all order by it; the
  campaign's preferred edition only breaks a tie inside one source.
- **A row shows one pill**: its source, shortened ("System Reference Document 5.2" reads "SRD
  5.2"), with "· legacy" for 2014 rules, and a **+** when other versions exist, its tooltip
  naming them. The record bar names the source once.
- **Editors are in titled sections** (Basics, Challenge, Armor class and hit points, Speed,
  Ability scores, …), each a fixed number of columns that drops to fewer below 640 px; labels sit
  above inputs that fill their column, and checkboxes sit on their own line at a section's foot.
  The title, Cancel and Save stay pinned at the top of the pane.
- **New homebrew's panel** has a close button and Escape; the copy search sits on the same line
  as Start a blank, wrapping below it in a narrow pane.
- **The record and the editors fill the inspector pane**, however wide.

## Consequences

- A DM running a legacy campaign who wants legacy versions first moves the legacy SRD above the
  2024 one; priority is Library-wide, not per campaign.
- The index rebuilds once on the first open after this change.

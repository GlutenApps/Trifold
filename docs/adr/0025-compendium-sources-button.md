# ADR 0025 · Library › Compendium has one Sources button instead of Browse, Sources and Homebrew

**Status:** accepted, 2026-11-11. Amends ADR 0004 (Library › Compendium's three segments).

## Context

Library › Compendium opened on a three-way toggle: Browse, Sources, Homebrew. Browse is what the
page is, so naming it added nothing, and Homebrew was only the browser with its Source filter set
to Homebrew, which the filter already does.

## Decision

- The page opens on the compendium browser with no toggle. One `btn` at the top right, **Sources**,
  shows the Sources card; there it reads **Compendium** (accessible name "Back to the
  compendium", so it never clashes with the Library nav's Compendium) and goes back.
- On Sources, **Import Game Master XML…** (primary) moves from the card into the header, beside
  that button. The card keeps the import progress, the report, the source list, Rebuild index and
  the 2024 books list.
- The Homebrew view is gone; the browser's Source filter picks Homebrew.

## Consequences

- The toggle no longer resets the browser's Source filter, which the console's Compendium tab
  shares.

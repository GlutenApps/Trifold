# ADR 0028 · Each imported file says which of its books use 2024 rules, when it matters

**Status:** accepted, 2026-11-11. Replaces the Library-wide "2024 rules by source book" text box
on Library › Compendium › Sources (DATA-FORMATS.md §2.10).

## Context

A community compendium file can mix books written for 2014 rules with newer 2024 ones. When it
does not tag the newer records `[5.5e]`, both copies of a record import as legacy: the row cannot
pick the right one for the campaign, the Edition filter is wrong, and source priority (ADR 0027)
cannot help, because both copies come from the same source. The fix was a free-text list of book
names, Library-wide, applied only to future imports. It asked the DM to understand the problem
before ever seeing it, to type book names exactly, and to import again.

## Decision

- **No text box.** Each imported file keeps its own list (`edition2024Books` in `source.json`,
  already in the schema).
- **The row says when it matters.** For each imported file, `reviewBooks` (@trifold/rules)
  lists the books its Source lines name, with counts, and counts the names that appear more
  than once in the same kind and edition from *different* books. Copies from one book are left
  alone, since marking a book cannot tell them apart. When there are any, the row shows "14
  monsters and 3 spells appear twice in this file, and nothing marks which copy uses 2024 rules"
  with **Choose 2024 books…**. Main works this out once per import of a file and caches it.
- **A checklist, not typing.** The file's books, each with its record count and a checkbox;
  Apply saves the list and re-parses the stored original at once
  (`sources.setEdition2024Books`). Record ids are kept by position in the file (kind, key and
  occurrence), because the edition, part of the usual re-import match, is what changes.
- **One quiet way in for the case it cannot see.** A book icon in an imported row's actions
  opens the same checklist, for a file that mixes editions without any duplicates.

## Consequences

- A DM who only uses the SRD and homebrew, or files that tag their 2024 records, never sees any
  of this.
- The Library-wide `edition2024Books` setting stays in the schema and still seeds a new import's
  list (so an existing list keeps working), but has no control of its own.

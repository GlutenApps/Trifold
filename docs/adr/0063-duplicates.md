# ADR 0063 — Duplicates are settled one record at a time

**Status:** accepted, 2026-11-23. Completes the replacement of ADR 0027's drag order begun in ADR 0061.

## Context

Stars (ADR 0061) set which books lead in general. Some clashes still need a GM's call for one record: the same spell in a starred book and in homebrew, or a monster in three books where the GM wants the second. The DM chose to settle clashes as they happen rather than with a global order (Ian, 2026-11-23).

## Decision

**A duplicate** is a record (kind and key) in more than one place, a place being a file and a book. Copies that are only the bundled SRD's two editions are not a duplicate, since the campaign's preferred edition settles them. Campaign creatures belong to their campaign and are left out; books that are off are left out.

**A choice** names one copy, as `sourceId|bookKey|edition`, for one record, as `kind|key`. Choices are kept in `library.json`'s `duplicateChoices`, so they survive Re-parse and re-import. A chosen copy answers first for its record: before homebrew and starred books, and whatever the edition. A choice whose copy is gone leaves the record to the usual order.

**Which copy answers**, in full: the chosen copy; homebrew; a starred book; imported files; the 2024 SRD; the legacy SRD; then the campaign's preferred edition and the source's name. The groups are decided in the query by kind, so a file imported since the last sync already ranks above the SRD.

**Two places to settle one.**
- On a record's page, **Always use this copy** when the record is in another file or book (another edition alone does not count). Pressed again, the record goes back to the usual order.
- **Library › Compendium › Sources › Duplicates**: every duplicate with the copy shown and why (your choice, your homebrew, a starred book, imported before the SRD), a choice of copy or Automatic, search, filters by kind and by settled or not, and paging. The Books tab's attention line counts the duplicates left to the order.

**The index.** `records` gains `chosen`, marked by `applyChoices`; the index version goes to 6. Every path that writes a source's rows (a sync, an import, a re-parse, a campaign file's stat blocks) re-marks starred, off and chosen records after, so a re-parse never drops a GM's choices until a restart. Saving `books` or `duplicateChoices` through `library.updateSettings` marks the index at once; the screens save choices that way, like any other setting.

## Consequences

- ADR 0027's saved order is gone from every path; saving `sourcePriority` no longer reorders anything.
- A large compendium can have well over a thousand duplicates. Most need nothing: stars and the usual order decide them. The tab is for the ones a GM cares about.
- Two copies can share a label when the bundled SRD and an imported file name the same book; the imported one adds its file's name.

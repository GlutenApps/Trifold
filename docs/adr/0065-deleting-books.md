# ADR 0065 — Deleting books

**Status:** accepted, 2026-11-23. Extends books (ADR 0061).

## Context

A book can be turned off (ADR 0061), which hides it and keeps it. The DM asked to be able to delete books too, behind a typed DELETE as a campaign's delete asks (2026-11-23). A book is not a file of its own: it is the records of an imported file that cite it, and Re-parse reads the whole file again, so a book deleted from `records.jsonl` alone would come back on the next parser update or 2024-rules change.

Two smaller fixes from the same review ride along.

## Decision

**Delete** is on Library › Compendium › Sources › Books: a trash button in each row's actions, and **Delete…** for a selection. Either opens an inline confirm, beside the row or under the toolbar, that says how many records leave the Library and from which files, and asks for DELETE.

- A book is deleted from every imported XML file that holds it. Its records leave `records.jsonl`, and the book's key goes into the file's `source.json` as `deletedBooks` (the file's records that name no book are `file:<id>`). Re-parse and a 2024-rules change leave those books out, and record ids are matched as before.
- A file left with no records is removed.
- **Importing the file again** (Import, not Re-parse) clears `deletedBooks` and brings the books back, even when the file is unchanged.
- Bundled SRD content and opted-in documents cannot be deleted; they come back on the next sync. A book only in those has no delete button, and a book in both loses only its imported copies.
- The Library's settings for a book that is gone are dropped: its star or off, its place in collections, and duplicate choices of its copies. What tables share and players' stand-in copies are refreshed.

**A 2024 mark names one printing.** Book names in a file's 2024 list were compared by record key, which drops bracketed text, so marking `Example Manual (2025)` also marked `Example Manual (2014)`. An entry with brackets now names one book exactly, as the Books tab writes it. An entry without brackets, as a DM may type it in Settings, still matches any printing of that title, except a printing whose bracketed year is before 2024 (`isMarked2024` in `packages/rules`). A file's per-book review keeps printings apart for the same reason. Files already imported are not re-read; the next Re-parse or rules change applies the new matching.

**The SRD's duplicate copy is labelled "SRD"** on the Duplicates tab, whatever book its records cite, so it never shares a label with an imported file's copy of the same book.

## Consequences

- Deleting is undone only by importing the file again; the confirm says so. Campaign references to deleted records stop resolving, as when a file is removed.
- `source.json` gains an optional field; no schema version change.

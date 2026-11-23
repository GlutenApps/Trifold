# ADR 0066 — The compendium filters by book

**Status:** accepted, 2026-11-23. Follows books as the unit (ADR 0061).

## Context

The compendium's Source filter listed files: one entry for a compendium of 150 books, nothing for any one of them. The DM asked for a books filter instead (2026-11-23). Browse on the Books tab already limited the list to one book, shown as a chip above the filters with its own close button: a second control for the same thing.

## Decision

**The Book filter** replaces the Source filter. It is a single select (`aria-label="Book"`):

- **Every book**.
- **Not from a book**: the bundled SRD (as "SRD 5.2 (bundled)", since an imported file can cite a book of the same name), homebrew, the open campaign's creatures, and a joined campaign's shared content, by name. These pick by source.
- **Collections** (ADR 0062) with at least one book: the list is limited to their books.
- **Starred** books, then **Other books** (or **Books** when none is starred): every book that is on. A file's records that cite no book are listed as "<file> (no book named)".
- In a campaign that uses collections, only that campaign's books and collections are offered.

What is picked is kept in the compendium store (`pick`) and survives a change of kind tab. Browse on the Books tab picks that book in the filter; the chip is gone, so the filter is the one place the limit shows and is lifted.

**A book covers only the imported files.** The bundled SRD's records cite a book too, and the legacy SRD's name equals the book an imported SRD 5.1 file cites. Starring a book or turning it off marked the SRD's records as well, and filtering by it showed them. `bookFilter` now limits a book to records from imported sources (`xml`, `open5e`), for book settings, the filter and collections alike.

## Consequences

- A file can no longer be picked as a whole; its books can, and a collection can group them.
- The filter can be long with a big compendium; native select type-ahead finds a book by its first letters.
